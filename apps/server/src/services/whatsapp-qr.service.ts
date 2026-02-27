import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { ingestIncomingMessage } from "./whatsapp.service";
import { normalizePhone } from "../utils/phone";

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
    lastError: string | null;
    lastDisconnectCode: number | null;
    updatedAt: string;
};

let clientRef: WebJsClient | null = null;
let messageMediaCtor: WebJsMessageMediaCtor | null = null;
let isStarting = false;
let reconnectEnabled = true;
let sessionGeneration = 0;
let runtimeGuardInstalled = false;

const runtimeState: Omit<WhatsAppQrAdminState, "provider" | "enabled" | "authPath"> = {
    status: "idle",
    qr: null,
    qrImageUrl: null,
    pairingCode: null,
    pairingPhone: null,
    lastError: null,
    lastDisconnectCode: null,
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

function currentAuthPath() {
    return process.env.WA_QR_AUTH_PATH || ".wa-qr-auth";
}

function currentWebJsClientId() {
    return process.env.WA_WEBJS_CLIENT_ID || "property-lounge";
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
    console.warn(`[wa:qr] transient runtime error (${source}): ${message}`);
    clientRef = null;
    updateRuntimeState({
        status: "disconnected",
        lastError: message,
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

        console.error("[wa:qr] uncaught exception:", error);
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
    if (typeof id?.id === "string" && id.id) {
        return id.id;
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

async function handleIncomingMessage(message: any) {
    if (!message || message.fromMe) {
        if (process.env.WA_QR_DEBUG === "true") {
            console.log("[wa:qr][debug] skip message: fromMe or invalid payload");
        }
        return;
    }

    const inboundReplyJidRaw = resolveInboundReplyJid(message);
    const inboundReplyJid = inboundReplyJidRaw ? normalizeChatId(inboundReplyJidRaw) : null;
    const body = extractTextMessage(message);

    if (!body) {
        if (process.env.WA_QR_DEBUG === "true") {
            console.log("[wa:qr][debug] skip message: text body not found");
        }
        return;
    }

    const fromWa = await resolveSenderPhoneWithLookup(message);
    if (!fromWa) {
        if (process.env.WA_QR_DEBUG === "true") {
            console.log(
                `[wa:qr][debug] skip message: unsupported sender from=${String(
                    message?.from || ""
                )} author=${String(message?.author || "")} type=${String(message?.type || "")}`
            );
        }

        if (inboundReplyJid && canReplyToJid(inboundReplyJid)) {
            const fallbackReply = await sendWhatsAppQrTextByJid(
                inboundReplyJid,
                "Harap menunggu agent professional akan menghubungi anda"
            );
            if (!fallbackReply.sent) {
                console.error(
                    `[wa:qr] fallback auto-reply failed to jid=${inboundReplyJid}: ${
                        fallbackReply.error || "unknown error"
                    }`
                );
            }
        }
        return;
    }

    if (process.env.WA_QR_DEBUG === "true") {
        console.log(`[wa:qr][debug] sender resolved=${fromWa}`);
    }

    const result = await ingestIncomingMessage({
        fromWa,
        body,
        providerMessageId: getInboundProviderMessageId(message),
        clientName: getInboundPushName(message),
    });

    if (process.env.WA_QR_DEBUG === "true") {
        console.log(`[wa:qr][debug] inbound processed: type=${result.type} from=${fromWa}`);
    }

    if (result.type === "client_message" && result.firstClientMessage) {
        const autoReplyText =
            typeof result.autoReplyText === "string" && result.autoReplyText.trim()
                ? result.autoReplyText.trim()
                : "Harap menunggu agent professional akan menghubungi anda";

        const replyResult = inboundReplyJid
            ? await sendWhatsAppQrTextByJid(inboundReplyJid, autoReplyText)
            : await sendWhatsAppQrText(fromWa, autoReplyText);

        if (!replyResult.sent) {
            console.error(
                `[wa:qr] auto-reply failed to ${fromWa}: ${replyResult.error || "unknown error"}`
            );
        } else if (process.env.WA_QR_DEBUG === "true") {
            console.log(
                `[wa:qr][debug] auto-reply sent to jid=${inboundReplyJid || phoneToChatId(fromWa)}`
            );
        }
    }
}

export function getWhatsAppQrAdminState(): WhatsAppQrAdminState {
    return {
        provider: currentProvider(),
        enabled: currentProvider() === "qr_local",
        authPath: currentAuthPath(),
        ...runtimeState,
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

    if (!clientRef) {
        updateRuntimeState({ status: "idle", qr: null, qrImageUrl: null, pairingCode: null });
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
        lastError: null,
        lastDisconnectCode: null,
    });
}

export async function startWhatsAppQrBridge() {
    installRuntimeGuard();

    if (currentProvider() !== "qr_local") {
        updateRuntimeState({
            status: "disabled",
            qr: null,
            qrImageUrl: null,
            pairingCode: null,
            pairingPhone: null,
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
        lastError: null,
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
                "[wa:qr] missing dependency. Run: pnpm --filter @property-lounge/server add whatsapp-web.js";
            console.error(message);
            console.error("[wa:qr] import error:", importError);
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
        const puppeteerOptions: Record<string, unknown> = {
            headless: currentWebJsHeadless(),
            args: currentWebJsPuppeteerArgs(),
        };
        const chromeExecutable = findLocalChromeExecutable();
        if (chromeExecutable) {
            puppeteerOptions.executablePath = chromeExecutable;
        } else {
            console.warn(
                "[wa:qr] Chrome executable not auto-detected. Configure WA_WEBJS_EXECUTABLE_PATH or install Chrome for Puppeteer."
            );
        }

        const client: WebJsClient = new ClientCtor({
            authStrategy: new LocalAuthCtor({
                clientId: currentWebJsClientId(),
                dataPath: authPath,
            }),
            webVersionCache: { type: "none" },
            puppeteer: puppeteerOptions,
        });

        clientRef = client;
        console.log(`[wa:qr] using auth path: ${authPath}`);
        console.log("[wa:qr] waiting for QR / existing session...");

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
            });
            console.log("[wa:qr] QR updated. Open Admin Settings page to scan it.");
        });

        client.on("ready", () => {
            if (generation !== sessionGeneration) {
                return;
            }

            updateRuntimeState({
                status: "connected",
                qr: null,
                qrImageUrl: null,
                pairingCode: null,
                pairingPhone: null,
                lastError: null,
                lastDisconnectCode: null,
            });
            console.log("[wa:qr] connected");
        });

        client.on("auth_failure", (message: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            updateRuntimeState({
                status: "error",
                lastError: message || "Authentication failure",
            });
            console.error("[wa:qr] auth failure:", message);
        });

        client.on("disconnected", (reason: string) => {
            if (generation !== sessionGeneration) {
                return;
            }

            clientRef = null;
            updateRuntimeState({
                status: "disconnected",
                lastDisconnectCode: null,
                lastError: reason || null,
                qr: null,
                qrImageUrl: null,
                pairingCode: null,
                pairingPhone: null,
            });
            console.log(`[wa:qr] disconnected: ${reason || "unknown"}`);

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
            if (generation !== sessionGeneration) {
                return;
            }

            try {
                await handleIncomingMessage(message);
            } catch (error) {
                console.error("[wa:qr] failed handling inbound message:", error);
            }
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
        const message = error instanceof Error ? error.message : "Unknown error";
        const chromeMissing = /Could not find Chrome|executable file not found|Browser was not found/i.test(
            message
        );
        const uiMessage = chromeMissing
            ? "Chrome belum ditemukan untuk WhatsApp session. Install browser dengan `pnpm dlx puppeteer browsers install chrome` atau set WA_WEBJS_EXECUTABLE_PATH ke lokasi Chrome."
            : message;
        console.error("[wa:qr] failed to start bridge:", error);
        updateRuntimeState({
            status: "error",
            lastError: uiMessage,
        });
    } finally {
        isStarting = false;
    }
}
