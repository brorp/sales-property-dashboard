import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { ingestIncomingMessage } from "./whatsapp.service";
import { getClientBySlug } from "./clients.service";
import {
    clearActiveWhatsAppNumber,
    setActiveWhatsAppNumber,
} from "./whatsapp-identity.service";
import { normalizePhone } from "../utils/phone";
import { createComponentLogger, markErrorAsHandled } from "../utils/logger";

type WebJsClient = {
    initialize: () => Promise<void>;
    destroy: () => Promise<void>;
    sendMessage: (chatId: string, content: any, options?: any) => Promise<any>;
    on: (event: string, listener: (...args: any[]) => void) => void;
};

type WebJsMessageMediaCtor = new (
    mimeType: string,
    base64Data: string,
    fileName?: string
) => any;

type QrSendResult =
    | {
        sent: true;
        provider: "qr_local";
        providerMessageId?: string;
    }
    | {
        sent: false;
        provider: "qr_local";
        error: string;
    };

export type WhatsAppQrAdminState = {
    provider: string;
    enabled: boolean;
    status:
    | "disabled"
    | "idle"
    | "starting"
    | "awaiting_qr"
    | "awaiting_pairing_code"
    | "connected"
    | "disconnected"
    | "error";
    authPath: string;
    qr: string | null;
    qrImageUrl: string | null;
    pairingCode: string | null;
    pairingPhone: string | null;
    activeWaNumber: string | null;
    lastClientState: string | null;
    lastError: string | null;
    lastDisconnectCode: number | null;
    activeClientSlug: string | null;
    updatedAt: string;
};

let clientRef: WebJsClient | null = null;
let messageMediaCtor: WebJsMessageMediaCtor | null = null;
let isStarting = false;
let reconnectEnabled = true;
let sessionGeneration = 0;
let runtimeGuardInstalled = false;
const RECENT_INBOUND_EVENT_WINDOW_MS = 5 * 60 * 1000;
const recentInboundEventIds = new Map<string, number>();

const waQrLogger = createComponentLogger("wa:qr");

const runtimeState: Omit<WhatsAppQrAdminState, "provider" | "enabled" | "authPath"> = {
    status: "idle",
    qr: null,
    qrImageUrl: null,
    pairingCode: null,
    pairingPhone: null,
    activeWaNumber: null,
    lastClientState: null,
    lastError: null,
    lastDisconnectCode: null,
    activeClientSlug: null,
    updatedAt: new Date().toISOString(),
};

const TRANSIENT_WEBJS_ERROR_PATTERNS = [
    "Execution context was destroyed",
    "Navigating frame was detached",
    "Protocol error",
    "Target closed",
    "Connection closed",
    "Session closed",
];

function currentProvider() {
    return (process.env.WA_PROVIDER || "dummy").toLowerCase();
}

function currentSessionScopeSlug() {
    const raw = String(process.env.WA_ACTIVE_CLIENT_SLUG || "").trim().toLowerCase();
    if (!raw) {
        return null;
    }

    const sanitized = raw.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return sanitized || null;
}

function currentAuthPath() {
    const explicit = String(process.env.WA_QR_AUTH_PATH || "").trim();
    if (explicit) {
        return explicit;
    }

    const scopedSlug = currentSessionScopeSlug();
    if (scopedSlug) {
        return `.wa-qr-auth-${scopedSlug}`;
    }

    return ".wa-qr-auth";
}

function currentWebJsClientId() {
    const explicit = String(process.env.WA_WEBJS_CLIENT_ID || "").trim();
    if (explicit) {
        return explicit;
    }

    const scopedSlug = currentSessionScopeSlug();
    if (scopedSlug) {
        return `wa-${scopedSlug}`;
    }

    return "property-lounge";
}

function currentActiveClientSlug() {
    const raw = String(process.env.WA_ACTIVE_CLIENT_SLUG || "").trim().toLowerCase();
    return raw || null;
}

function describeSessionIsolation() {
    const explicitAuthPath = String(process.env.WA_QR_AUTH_PATH || "").trim();
    const explicitClientId = String(process.env.WA_WEBJS_CLIENT_ID || "").trim();
    const scopedSlug = currentSessionScopeSlug();

    return {
        authPath: currentAuthPath(),
        clientId: currentWebJsClientId(),
        scopeSlug: scopedSlug,
        authPathSource: explicitAuthPath ? "explicit" : scopedSlug ? "derived_from_slug" : "default",
        clientIdSource: explicitClientId ? "explicit" : scopedSlug ? "derived_from_slug" : "default",
    };
}

function isQrDebugEnabled() {
    return process.env.WA_QR_DEBUG === "true";
}

function writeWaStdout(level: "info" | "warn" | "error", message: string, meta: Record<string, unknown>) {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        component: "wa:qr",
        message,
        ...meta,
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
        return;
    }
    console.log(line);
}

function logWaQrInfo(message: string, meta: Record<string, unknown> = {}) {
    waQrLogger.info(message, meta);
    writeWaStdout("info", message, meta);
}

function logWaQrWarn(message: string, meta: Record<string, unknown> = {}) {
    waQrLogger.warn(message, meta);
    writeWaStdout("warn", message, meta);
}

function logWaQrError(message: string, meta: Record<string, unknown> = {}) {
    waQrLogger.error(message, meta);
    writeWaStdout("error", message, meta);
}

function currentWebJsHeadless() {
    return String(process.env.WA_WEBJS_HEADLESS || "true").toLowerCase() !== "false";
}

function currentWebJsPuppeteerArgs() {
    const defaults = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
    ];
    const extra = String(process.env.WA_WEBJS_PUPPETEER_ARGS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return Array.from(new Set([...defaults, ...extra]));
}

function currentWebJsVersionCache() {
    const mode = String(process.env.WA_WEBJS_WEB_VERSION_CACHE || "local")
        .trim()
        .toLowerCase();

    if (mode === "none") {
        return { type: "none" as const };
    }

    if (mode === "remote") {
        const remotePath = String(process.env.WA_WEBJS_REMOTE_WEB_VERSION_CACHE_URL || "").trim();
        if (remotePath) {
            return {
                type: "remote" as const,
                remotePath,
            };
        }
    }

    return { type: "local" as const };
}

function currentWebJsVersion() {
    const raw = String(process.env.WA_WEBJS_WEB_VERSION || "").trim();
    return raw || undefined;
}

function currentWebJsUserAgent() {
    const raw = String(process.env.WA_WEBJS_USER_AGENT || "").trim();
    if (!raw) {
        return false;
    }
    if (raw.toLowerCase() === "browser_default") {
        return false;
    }
    return raw;
}

function findLocalChromeExecutable() {
    const envPath = process.env.WA_WEBJS_EXECUTABLE_PATH?.trim();
    if (envPath) {
        return envPath;
    }

    const candidates: string[] = [];

    if (process.platform === "darwin") {
        candidates.push(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        );
    } else if (process.platform === "linux") {
        candidates.push(
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/snap/bin/chromium"
        );
    } else if (process.platform === "win32") {
        const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
        const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
        candidates.push(
            `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
            `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
            `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`
        );
    }

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function updateRuntimeState(
    patch: Partial<Omit<WhatsAppQrAdminState, "provider" | "enabled" | "authPath">>
) {
    Object.assign(runtimeState, patch, { updatedAt: new Date().toISOString() });
}

function markConnectedState(clientState?: string) {
    updateRuntimeState({
        status: "connected",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
        pairingPhone: null,
        lastClientState: clientState || runtimeState.lastClientState || null,
        lastError: null,
        lastDisconnectCode: null,
    });
}

function readErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error || "Unknown error");
}

function readErrorStack(error: unknown) {
    if (error instanceof Error && error.stack) {
        return error.stack;
    }
    return "";
}

function isTransientWebJsRuntimeError(error: unknown) {
    const message = readErrorMessage(error);
    const stack = readErrorStack(error);
    const combined = `${message}\n${stack}`;
    const fromWebJs = /whatsapp-web\.js|puppeteer-core|puppeteer/i.test(combined);
    if (!fromWebJs) {
        return false;
    }

    return TRANSIENT_WEBJS_ERROR_PATTERNS.some((pattern) =>
        combined.toLowerCase().includes(pattern.toLowerCase())
    );
}

function scheduleBridgeRestart(delayMs = 2500) {
    setTimeout(() => {
        if (!reconnectEnabled || isStarting || clientRef) {
            return;
        }
        void startWhatsAppQrBridge();
    }, delayMs);
}

function handleTransientRuntimeError(source: string, error: unknown) {
    const message = readErrorMessage(error);
    markErrorAsHandled(error);
    waQrLogger.warn("Transient runtime error", { source, error, message });
    clientRef = null;
    clearActiveWhatsAppNumber();
    updateRuntimeState({
        status: "disconnected",
        lastError: message,
        activeWaNumber: null,
        lastClientState: null,
        qr: null,
        qrImageUrl: null,
    });
    if (reconnectEnabled) {
        scheduleBridgeRestart();
    }
}

function installRuntimeGuard() {
    if (runtimeGuardInstalled) {
        return;
    }
    runtimeGuardInstalled = true;

    process.on("uncaughtException", (error, origin) => {
        if (isTransientWebJsRuntimeError(error)) {
            handleTransientRuntimeError(`uncaughtException:${origin}`, error);
            return;
        }

        waQrLogger.error("Uncaught WhatsApp QR exception", { origin, error });
        process.exit(1);
    });
}

function toDigitsOnly(input: string) {
    return input.replace(/[^\d]/g, "");
}

function qrToImageUrl(qr: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`;
}

function phoneToChatId(phone: string) {
    const normalized = normalizePhone(phone);
    const digits = toDigitsOnly(normalized);
    return `${digits}@c.us`;
}

function normalizeChatId(input: string) {
    const trimmed = String(input || "").trim();
    if (!trimmed) {
        return "";
    }

    if (!trimmed.includes("@")) {
        return phoneToChatId(trimmed);
    }

    const [rawPart, domain] = trimmed.split("@");
    if (!rawPart || !domain) {
        return trimmed;
    }

    if (domain === "c.us" || domain === "g.us" || domain === "broadcast" || domain === "status" || domain === "lid") {
        return trimmed;
    }

    if (domain === "s.whatsapp.net") {
        const digits = toDigitsOnly(rawPart);
        if (digits.length >= 8) {
            return `${digits}@c.us`;
        }
    }

    return trimmed;
}

function getEventMessageType(message: any) {
    return String(message?.type || message?._data?.type || "").trim().toLowerCase();
}

function getEventChatId(message: any) {
    const candidates = uniq([
        typeof message?.from === "string" ? message.from : null,
        typeof message?._data?.from === "string" ? message._data.from : null,
        typeof message?.id?.remote === "string" ? message.id.remote : null,
        typeof message?._data?.id?.remote === "string" ? message._data.id.remote : null,
        typeof message?._data?.chatId === "string" ? message._data.chatId : null,
        typeof message?._data?.chat?.id?._serialized === "string"
            ? message._data.chat.id._serialized
            : null,
    ]);

    const chatId = candidates[0] || null;
    return chatId ? normalizeChatId(chatId) : null;
}

function isEventFromMe(message: any) {
    return Boolean(
        message?.fromMe ||
        message?._data?.fromMe ||
        message?.id?.fromMe ||
        message?._data?.id?.fromMe
    );
}

function isStatusLikeMessage(message: any, chatId: string | null) {
    const type = getEventMessageType(message);
    return Boolean(
        chatId === "status@broadcast" ||
        message?.isStatus === true ||
        message?._data?.isStatus === true ||
        message?._data?.isStatusV3 === true ||
        type === "status" ||
        type === "status_notification"
    );
}

function isGroupLikeMessage(chatId: string | null) {
    return Boolean(chatId && chatId.endsWith("@g.us"));
}

function isBroadcastLikeMessage(chatId: string | null) {
    return Boolean(chatId && chatId.endsWith("@broadcast"));
}

function isPrivateUserChat(chatId: string | null) {
    return Boolean(
        chatId &&
        (
            chatId.endsWith("@c.us") ||
            chatId.endsWith("@s.whatsapp.net") ||
            chatId.endsWith("@lid")
        )
    );
}

function describeInboundEvent(message: any) {
    return {
        providerMessageId: getInboundProviderMessageId(message) || null,
        chatId: getEventChatId(message),
        type: getEventMessageType(message) || null,
        fromMe: isEventFromMe(message),
    };
}

function logIgnoredWhatsAppEvent(message: any, reason: string, extra: Record<string, unknown> = {}) {
    logWaQrInfo("Inbound WhatsApp event ignored", {
        reason,
        ...describeInboundEvent(message),
        ...extra,
    });
}

function pruneRecentInboundEventIds(now = Date.now()) {
    for (const [providerMessageId, createdAt] of recentInboundEventIds.entries()) {
        if (now - createdAt > RECENT_INBOUND_EVENT_WINDOW_MS) {
            recentInboundEventIds.delete(providerMessageId);
        }
    }
}

function hasRecentInboundEventId(providerMessageId: string | null | undefined) {
    if (!providerMessageId) {
        return false;
    }

    pruneRecentInboundEventIds();
    return recentInboundEventIds.has(providerMessageId);
}

function rememberRecentInboundEventId(providerMessageId: string | null | undefined) {
    if (!providerMessageId) {
        return;
    }

    pruneRecentInboundEventIds();
    recentInboundEventIds.set(providerMessageId, Date.now());
}

function plainToPhone(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const raw = value.trim();
    if (!raw) {
        return null;
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 15) {
        return null;
    }

    // Filter out non-MSISDN identifiers (e.g. internal LID-like numeric ids).
    // Current business scope is Indonesian numbers.
    const likelyPhone =
        raw.startsWith("+62") ||
        raw.startsWith("62") ||
        raw.startsWith("08") ||
        raw.startsWith("8");

    if (!likelyPhone) {
        return null;
    }

    return normalizePhone(digits);
}

function jidToPhone(jid: string | null | undefined) {
    if (!jid || typeof jid !== "string") {
        return null;
    }

    const [rawPart, domain] = jid.split("@");
    if (!rawPart || !domain) {
        return null;
    }

    if (
        domain === "g.us" ||
        domain === "broadcast" ||
        domain === "status" ||
        domain === "newsletter"
    ) {
        return null;
    }

    // Do not trust @lid as phone source. It is a WhatsApp LID identifier,
    // not guaranteed to be the user's phone number.
    if (domain !== "c.us" && domain !== "s.whatsapp.net") {
        return null;
    }

    const digits = toDigitsOnly(rawPart.split(":")[0]);
    if (!digits || digits.length < 8) {
        return null;
    }

    return normalizePhone(digits);
}

function uniq(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter(Boolean))) as string[];
}

function resolveInboundReplyJid(message: any) {
    const candidates = uniq([
        typeof message?.from === "string" ? message.from : null,
        typeof message?.author === "string" ? message.author : null,
        typeof message?.id?.remote === "string" ? message.id.remote : null,
    ]);

    return candidates[0] || null;
}

function resolveSenderPhone(message: any) {
    const jidCandidates = uniq([
        jidToPhone(message?.from),
        jidToPhone(message?.author),
        jidToPhone(message?.id?.remote),
        jidToPhone(message?._data?.from),
        jidToPhone(message?._data?.author),
        jidToPhone(message?._data?.id?.remote),
        jidToPhone(message?._data?.id?.participant),
        jidToPhone(message?._data?.chatId),
        jidToPhone(message?._data?.chat?.id?._serialized),
    ]);

    const plainCandidates = uniq([
        plainToPhone(message?._data?.fromPn),
        plainToPhone(message?._data?.authorPn),
        plainToPhone(message?._data?.id?.participantPn),
        plainToPhone(message?._data?.participantPn),
        plainToPhone(message?._data?.sender?.id),
        plainToPhone(message?._data?.sender?.user),
    ]);

    const all = uniq([...plainCandidates, ...jidCandidates]);
    if (all.length === 0) {
        return null;
    }

    const idPreferred = all.find((candidate) => candidate.startsWith("+62"));
    return idPreferred || all[0];
}

function pickPreferredPhone(candidates: Array<string | null | undefined>) {
    const values = uniq(candidates);
    if (values.length === 0) {
        return null;
    }
    const idPreferred = values.find((candidate) => candidate.startsWith("+62"));
    return idPreferred || values[0];
}

function resolveConnectedAccountPhone(client: any) {
    return pickPreferredPhone([
        jidToPhone(client?.info?.wid?._serialized),
        jidToPhone(client?.info?.me?._serialized),
        jidToPhone(client?.info?.id?._serialized),
        client?.info?.wid?.user ? plainToPhone(String(client.info.wid.user)) : null,
        client?.info?.me?.user ? plainToPhone(String(client.info.me.user)) : null,
        client?.info?.id?.user ? plainToPhone(String(client.info.id.user)) : null,
        plainToPhone(client?.info?.phone),
        plainToPhone(client?.info?.phoneNumber),
    ]);
}

async function resolveSenderPhoneWithLookup(message: any) {
    const direct = resolveSenderPhone(message);
    if (direct) {
        return direct;
    }

    try {
        if (typeof message?.getContact === "function") {
            const contact = await message.getContact();
            const fromContact = pickPreferredPhone([
                plainToPhone(contact?.number),
                plainToPhone(contact?.userid),
                plainToPhone(contact?.phoneNumber),
                jidToPhone(contact?.id?._serialized),
                jidToPhone(contact?.id?.user ? `${contact.id.user}@c.us` : null),
            ]);
            if (fromContact) {
                return fromContact;
            }
        }
    } catch {
        // ignore contact lookup errors
    }

    try {
        if (typeof message?.getChat === "function") {
            const chat = await message.getChat();
            const fromChat = pickPreferredPhone([
                jidToPhone(chat?.id?._serialized),
                jidToPhone(chat?.contact?.id?._serialized),
                plainToPhone(chat?.contact?.number),
                plainToPhone(chat?.contact?.userid),
                plainToPhone(chat?.contact?.phoneNumber),
            ]);
            if (fromChat) {
                return fromChat;
            }
        }
    } catch {
        // ignore chat lookup errors
    }

    return null;
}

function extractTextMessage(message: any): string | null {
    const candidates = [
        typeof message?.body === "string" ? message.body : "",
        typeof message?._data?.body === "string" ? message._data.body : "",
        typeof message?._data?.caption === "string" ? message._data.caption : "",
    ];

    for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    // Handle non-text inbound as valid first contact so lead still gets created.
    if (message?.hasMedia || message?._data?.hasMedia) {
        return "[media]";
    }

    const type = String(message?.type || message?._data?.type || "").toLowerCase();
    if (type === "sticker") {
        return "[sticker]";
    }
    if (type === "audio" || type === "ptt") {
        return "[audio]";
    }
    if (type === "location" || type === "live_location") {
        return "[location]";
    }
    if (type === "document") {
        return "[document]";
    }
    if (type === "vcard" || type === "contact_card" || type === "multi_vcard") {
        return "[contact]";
    }

    return null;
}

function getInboundProviderMessageId(message: any) {
    const id = message?.id;
    if (typeof id?._serialized === "string" && id._serialized) {
        return id._serialized;
    }
    if (typeof message?._data?.id?._serialized === "string" && message._data.id._serialized) {
        return message._data.id._serialized;
    }
    if (typeof id?.id === "string" && id.id) {
        return id.id;
    }
    if (typeof message?._data?.id?.id === "string" && message._data.id.id) {
        return message._data.id.id;
    }
    return undefined;
}

function getInboundPushName(message: any) {
    const candidates = [
        message?._data?.notifyName,
        message?._data?.pushname,
        message?._data?.sender?.pushname,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    return undefined;
}

function toSendResult(response: any): QrSendResult {
    const providerMessageId =
        (typeof response?.id?._serialized === "string" && response.id._serialized) ||
        (typeof response?.id?.id === "string" && response.id.id) ||
        undefined;

    return {
        sent: true,
        provider: "qr_local" as const,
        providerMessageId,
    };
}

function toSendError(error: string): QrSendResult {
    return {
        sent: false,
        provider: "qr_local" as const,
        error,
    };
}

function canReplyToJid(jid: string | null) {
    if (!jid) {
        return false;
    }
    const normalized = normalizeChatId(jid);
    return Boolean(normalized);
}

export function shouldIgnoreWhatsAppEvent(message: any) {
    if (!message) {
        return { ignore: true, reason: "invalid_payload" as const };
    }

    const chatId = getEventChatId(message);

    if (isEventFromMe(message)) {
        return { ignore: true, reason: "from_me" as const };
    }

    if (isStatusLikeMessage(message, chatId)) {
        return { ignore: true, reason: "status_broadcast" as const };
    }

    if (isGroupLikeMessage(chatId)) {
        return { ignore: true, reason: "group_message" as const };
    }

    if (isBroadcastLikeMessage(chatId)) {
        return { ignore: true, reason: "broadcast_message" as const };
    }

    if (!isPrivateUserChat(chatId)) {
        return { ignore: true, reason: "invalid_private_chat" as const };
    }

    const providerMessageId = getInboundProviderMessageId(message);
    if (hasRecentInboundEventId(providerMessageId)) {
        return { ignore: true, reason: "duplicate_message_id" as const };
    }

    return { ignore: false, reason: null };
}

export function isValidIncomingLeadMessage(message: any) {
    return !shouldIgnoreWhatsAppEvent(message).ignore;
}

async function handleIncomingMessage(message: any) {
    const ignoreDecision = shouldIgnoreWhatsAppEvent(message);
    if (ignoreDecision.ignore) {
        logIgnoredWhatsAppEvent(message, ignoreDecision.reason || "ignored");
        return;
    }

    const providerMessageId = getInboundProviderMessageId(message);
    rememberRecentInboundEventId(providerMessageId);

    const inboundReplyJidRaw = resolveInboundReplyJid(message);
    const inboundReplyJid = inboundReplyJidRaw ? normalizeChatId(inboundReplyJidRaw) : null;
    const body = extractTextMessage(message);

    if (!body) {
        logIgnoredWhatsAppEvent(message, "unsupported_body");
        return;
    }

    const fromWa = await resolveSenderPhoneWithLookup(message);
    if (!fromWa) {
        logIgnoredWhatsAppEvent(message, "invalid_sender_phone");
        return;
    }

    if (isQrDebugEnabled()) {
        logWaQrInfo("Inbound sender resolved", { fromWa });
    }

    const activeClientSlug = currentActiveClientSlug();
    if (!activeClientSlug) {
        logWaQrError("Inbound message ignored", { reason: "missing_active_client_slug" });
        return;
    }

    let activeClientId: string | null = null;
    const activeClient = await getClientBySlug(activeClientSlug);
    activeClientId = activeClient?.id || null;
    if (!activeClientId) {
        logWaQrError("Inbound message ignored", {
            reason: "active_client_not_found",
            activeClientSlug,
        });
        return;
    }

    const result = await ingestIncomingMessage({
        fromWa,
        body,
        providerMessageId,
        clientName: getInboundPushName(message),
        clientId: activeClientId,
    });

    logWaQrInfo("Inbound message processed", {
        type: result.type,
        fromWa,
        clientId: activeClientId,
        firstClientMessage: Boolean(result.firstClientMessage),
    });

    if (result.type === "client_message" && result.firstClientMessage) {
        const autoReplyText =
            typeof result.autoReplyText === "string" && result.autoReplyText.trim()
                ? result.autoReplyText.trim()
                : "Harap menunggu agent professional akan menghubungi anda";

        const replyResult = inboundReplyJid
            ? await sendWhatsAppQrTextByJid(inboundReplyJid, autoReplyText)
            : await sendWhatsAppQrText(fromWa, autoReplyText);

        if (!replyResult.sent) {
            logWaQrError("Auto-reply failed", {
                fromWa,
                jid: inboundReplyJid || phoneToChatId(fromWa),
                error: replyResult.error || "unknown error",
            });
        } else if (isQrDebugEnabled()) {
            logWaQrInfo("Auto-reply sent", {
                fromWa,
                jid: inboundReplyJid || phoneToChatId(fromWa),
            });
        }
    }
}

async function handleIncomingMessageEvent(eventName: string, generation: number, message: any) {
    if (generation !== sessionGeneration) {
        return;
    }

    if (isQrDebugEnabled()) {
        logWaQrInfo("Inbound WhatsApp event received", {
            eventName,
            messageId: getInboundProviderMessageId(message) || null,
            chatId: getEventChatId(message) || null,
            fromMe: isEventFromMe(message),
            type: String(message?.type || message?._data?.type || "").toLowerCase() || null,
        });
    }

    try {
        await handleIncomingMessage(message);
    } catch (error) {
        logWaQrError("Failed handling inbound WhatsApp message", {
            eventName,
            error,
        });
    }
}

export function getWhatsAppQrAdminState(): WhatsAppQrAdminState {
    return {
        provider: currentProvider(),
        enabled: currentProvider() === "qr_local",
        authPath: currentAuthPath(),
        ...runtimeState,
        activeClientSlug: currentActiveClientSlug(),
    };
}

export async function sendWhatsAppQrText(
    to: string,
    body: string
): Promise<QrSendResult> {
    if (currentProvider() !== "qr_local") {
        return toSendError("WA_PROVIDER is not qr_local");
    }

    if (!clientRef) {
        return toSendError("QR WhatsApp client is not connected yet");
    }

    return sendWhatsAppQrTextByJid(phoneToChatId(to), body);
}

async function sendWhatsAppQrTextByJid(
    jid: string,
    body: string
): Promise<QrSendResult> {
    return sendWhatsAppQrPayloadByJid(jid, { text: body });
}

export async function sendWhatsAppQrMedia(params: {
    to: string;
    body?: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName?: string;
}): Promise<QrSendResult> {
    if (currentProvider() !== "qr_local") {
        return toSendError("WA_PROVIDER is not qr_local");
    }

    if (!clientRef) {
        return toSendError("QR WhatsApp client is not connected yet");
    }

    const caption = params.body?.trim() || undefined;
    const payload = params.mimeType.startsWith("video/")
        ? {
            video: params.mediaBuffer,
            mimetype: params.mimeType,
            caption,
            fileName: params.fileName,
        }
        : {
            image: params.mediaBuffer,
            mimetype: params.mimeType,
            caption,
            fileName: params.fileName,
        };

    return sendWhatsAppQrPayloadByJid(phoneToChatId(params.to), payload);
}

async function sendWhatsAppQrPayloadByJid(
    jid: string,
    payload: any
): Promise<QrSendResult> {
    if (currentProvider() !== "qr_local") {
        return toSendError("WA_PROVIDER is not qr_local");
    }

    if (!clientRef) {
        return toSendError("QR WhatsApp client is not connected yet");
    }

    const chatId = normalizeChatId(jid);
    if (!chatId) {
        return toSendError("Invalid WhatsApp chat id");
    }

    try {
        if (typeof payload?.text === "string") {
            const response = await clientRef.sendMessage(chatId, payload.text);
            return toSendResult(response);
        }

        const mediaBytes = payload?.image || payload?.video;
        if (mediaBytes) {
            if (!messageMediaCtor) {
                return toSendError("MessageMedia is not available");
            }

            const mediaBuffer = Buffer.isBuffer(mediaBytes)
                ? mediaBytes
                : Buffer.from(mediaBytes);
            const media = new messageMediaCtor(
                payload.mimetype || "application/octet-stream",
                mediaBuffer.toString("base64"),
                payload.fileName
            );
            const options = payload.caption ? { caption: String(payload.caption) } : undefined;
            const response = await clientRef.sendMessage(chatId, media, options);
            return toSendResult(response);
        }

        const response = await clientRef.sendMessage(chatId, payload);
        return toSendResult(response);
    } catch (error) {
        return toSendError(error instanceof Error ? error.message : "Unknown error");
    }
}

export async function stopWhatsAppQrBridge() {
    reconnectEnabled = false;
    sessionGeneration += 1;
    clearActiveWhatsAppNumber();

    if (!clientRef) {
        updateRuntimeState({
            status: "idle",
            qr: null,
            qrImageUrl: null,
            pairingCode: null,
            pairingPhone: null,
            activeWaNumber: null,
            lastClientState: null,
        });
        return;
    }

    const client = clientRef;
    clientRef = null;

    try {
        await client.destroy();
    } catch {
        // ignore
    }

    updateRuntimeState({
        status: "disconnected",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
        pairingPhone: null,
        activeWaNumber: null,
        lastClientState: null,
    });
}

export async function resetWhatsAppQrSession() {
    await stopWhatsAppQrBridge();
    await rm(currentAuthPath(), { recursive: true, force: true });
    updateRuntimeState({
        status: "idle",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
        pairingPhone: null,
        activeWaNumber: null,
        lastClientState: null,
        lastError: null,
        lastDisconnectCode: null,
    });
}

export async function startWhatsAppQrBridge() {
    installRuntimeGuard();

    if (currentProvider() !== "qr_local") {
        clearActiveWhatsAppNumber();
        updateRuntimeState({
            status: "disabled",
            qr: null,
            qrImageUrl: null,
            pairingCode: null,
            pairingPhone: null,
            activeWaNumber: null,
            lastClientState: null,
            activeClientSlug: currentActiveClientSlug(),
        });
        return;
    }

    if (clientRef || isStarting) {
        return;
    }

    reconnectEnabled = true;
    isStarting = true;
    const generation = ++sessionGeneration;

    updateRuntimeState({
        status: "starting",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
        pairingPhone: null,
        activeWaNumber: null,
        lastClientState: null,
        lastError: null,
        activeClientSlug: currentActiveClientSlug(),
    });

    try {
        let ClientCtor: any;
        let LocalAuthCtor: any;

        try {
            const webJsModule = await import("whatsapp-web.js");
            const webJsAny = (webJsModule as any).default || webJsModule;
            ClientCtor = webJsAny.Client;
            LocalAuthCtor = webJsAny.LocalAuth;
            messageMediaCtor = (webJsAny.MessageMedia || null) as WebJsMessageMediaCtor | null;
        } catch (importError) {
            const message =
                "Missing dependency. Run: pnpm --filter @property-lounge/server add whatsapp-web.js";
            waQrLogger.error("Failed loading whatsapp-web.js", {
                error: importError,
                action: "pnpm --filter @property-lounge/server add whatsapp-web.js",
            });
            updateRuntimeState({
                status: "error",
                lastError: message,
            });
            return;
        }

        if (!ClientCtor || !LocalAuthCtor) {
            throw new Error("whatsapp-web.js exports are unavailable");
        }

        const authPath = currentAuthPath();
        const sessionIsolation = describeSessionIsolation();
        const puppeteerOptions: Record<string, unknown> = {
            headless: currentWebJsHeadless(),
            args: currentWebJsPuppeteerArgs(),
        };
        const chromeExecutable = findLocalChromeExecutable();
        if (chromeExecutable) {
            puppeteerOptions.executablePath = chromeExecutable;
        } else {
            waQrLogger.warn("Chrome executable not auto-detected", {
                platform: process.platform,
                envVar: "WA_WEBJS_EXECUTABLE_PATH",
            });
        }

        const webVersionCache = currentWebJsVersionCache();
        const webVersion = currentWebJsVersion();
        const userAgent = currentWebJsUserAgent();

        const client: WebJsClient = new ClientCtor({
            authStrategy: new LocalAuthCtor({
                clientId: currentWebJsClientId(),
                dataPath: authPath,
            }),
            webVersionCache,
            webVersion,
            puppeteer: puppeteerOptions,
            userAgent,
        });

        clientRef = client;
        waQrLogger.info("Starting WhatsApp QR bridge", {
            authPath,
            clientId: currentWebJsClientId(),
            authPathSource: sessionIsolation.authPathSource,
            clientIdSource: sessionIsolation.clientIdSource,
            scopeSlug: sessionIsolation.scopeSlug,
            headless: currentWebJsHeadless(),
            executablePath: chromeExecutable || null,
            userAgent: userAgent || null,
            webVersion: webVersion || null,
            webVersionCacheType: webVersionCache.type,
            webVersionCacheRemotePath:
                "remotePath" in webVersionCache ? webVersionCache.remotePath : null,
            activeClientSlug: currentActiveClientSlug(),
        });

        client.on("qr", (qr: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            updateRuntimeState({
                status: "awaiting_qr",
                qr,
                qrImageUrl: qrToImageUrl(qr),
                pairingCode: null,
                pairingPhone: null,
                lastClientState: null,
            });
            waQrLogger.info("QR updated", { status: "awaiting_qr" });
        });

        client.on("authenticated", () => {
            if (generation !== sessionGeneration) {
                return;
            }

            // After successful scan, QR should disappear even if "ready" is still warming up.
            updateRuntimeState({
                status: "starting",
                qr: null,
                qrImageUrl: null,
                pairingCode: null,
                pairingPhone: null,
                lastClientState: "AUTHENTICATED",
                lastError: null,
            });
            waQrLogger.info("WhatsApp QR authenticated", { status: "starting" });
        });

        client.on("change_state", (state: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            const normalized = String(state || "").toUpperCase();
            updateRuntimeState({ lastClientState: normalized || null });
            if (normalized === "CONNECTED" || normalized === "OPENING") {
                markConnectedState(normalized);
            }
        });

        client.on("ready", () => {
            if (generation !== sessionGeneration) {
                return;
            }

            const activeWaNumber = resolveConnectedAccountPhone(client);
            setActiveWhatsAppNumber(activeWaNumber);
            updateRuntimeState({ activeWaNumber });
            markConnectedState("READY");
            waQrLogger.info("WhatsApp QR connected", { activeWaNumber: activeWaNumber || null });
        });

        client.on("auth_failure", (message: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            clearActiveWhatsAppNumber();
            updateRuntimeState({
                status: "error",
                activeWaNumber: null,
                lastClientState: null,
                lastError: message || "Authentication failure",
            });
            waQrLogger.error("WhatsApp QR authentication failed", { message });
        });

        client.on("disconnected", (reason: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            clientRef = null;
            clearActiveWhatsAppNumber();
            updateRuntimeState({
                status: "disconnected",
                lastDisconnectCode: null,
                activeWaNumber: null,
                lastClientState: null,
                lastError: reason || null,
                qr: null,
                qrImageUrl: null,
                pairingCode: null,
                pairingPhone: null,
            });
            waQrLogger.warn("WhatsApp QR disconnected", { reason: reason || "unknown" });

            if (!reconnectEnabled || generation !== sessionGeneration) {
                return;
            }

            setTimeout(() => {
                if (reconnectEnabled && generation === sessionGeneration) {
                    void startWhatsAppQrBridge();
                }
            }, 2000);
        });

        client.on("message", async (message: any) => {
            await handleIncomingMessageEvent("message", generation, message);
        });

        client.on("message_create", async (message: any) => {
            await handleIncomingMessageEvent("message_create", generation, message);
        });

        await client.initialize();

        if (generation !== sessionGeneration) {
            try {
                await client.destroy();
            } catch {
                // ignore
            }
            clientRef = null;
        }
    } catch (error) {
        clientRef = null;
        clearActiveWhatsAppNumber();
        const message = error instanceof Error ? error.message : "Unknown error";
        const chromeMissing = /Could not find Chrome|executable file not found|Browser was not found/i.test(
            message
        );
        const uiMessage = chromeMissing
            ? "Chrome belum ditemukan untuk WhatsApp session. Install browser dengan `pnpm dlx puppeteer browsers install chrome` atau set WA_WEBJS_EXECUTABLE_PATH ke lokasi Chrome."
            : message;
        waQrLogger.error("Failed to start WhatsApp QR bridge", {
            error,
            chromeMissing,
            activeClientSlug: currentActiveClientSlug(),
        });
        updateRuntimeState({
            status: "error",
            activeWaNumber: null,
            lastClientState: null,
            lastError: uiMessage,
        });
    } finally {
        isStarting = false;
    }
}
