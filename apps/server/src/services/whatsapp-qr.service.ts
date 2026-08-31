import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ingestIncomingMessage } from "./whatsapp.service";
import { getClientBySlug } from "./clients.service";
import {
    clearActiveWhatsAppNumber,
    setActiveWhatsAppNumber,
} from "./whatsapp-identity.service";
import { normalizePhone } from "../utils/phone";
import { createComponentLogger, markErrorAsHandled } from "../utils/logger";
import {
    isHealthyWhatsAppClientState,
    isWhatsAppBrowserProcessForProfile,
    shouldDisableMissedMessageRecovery,
    shouldRestartWhatsAppBridge,
    validateWorkspaceWhatsAppIdentity,
} from "../utils/whatsapp-runtime";
import {
    recordWhatsAppAlert,
    resolveWhatsAppAlert,
    resolveWhatsAppAlertsForClient,
} from "./whatsapp-alert.service";

type WebJsClient = {
    initialize: () => Promise<void>;
    destroy: () => Promise<void>;
    getState?: () => Promise<string | null>;
    getWWebVersion?: () => Promise<string>;
    pupBrowser?: {
        close?: () => Promise<void>;
        isConnected?: () => boolean;
        process?: () => { pid?: number } | null;
        on?: (event: string, listener: () => void) => void;
    };
    pupPage?: {
        isClosed?: () => boolean;
    };
    sendMessage: (chatId: string, content: any, options?: any) => Promise<any>;
    searchMessages?: (
        query: string,
        options?: { chatId?: string; page?: number; limit?: number }
    ) => Promise<Array<{
        body?: string;
        fromMe?: boolean;
        timestamp?: number;
        id?: { _serialized?: string } | string;
    }>>;
    getChats?: () => Promise<WebJsChat[]>;
    on: (event: string, listener: (...args: any[]) => void) => void;
};

type WebJsChat = {
    id?: { _serialized?: string } | string;
    isGroup?: boolean;
    unreadCount?: number;
    timestamp?: number;
    lastMessage?: any;
    fetchMessages?: (options: { limit: number }) => Promise<any[]>;
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
        errorCode?: string;
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
    activeWebVersion: string | null;
    browserPid: number | null;
    lastRecoverySource: string | null;
    lastRecoveryAt: string | null;
    updatedAt: string;
};

let clientRef: WebJsClient | null = null;
let messageMediaCtor: WebJsMessageMediaCtor | null = null;
let isStarting = false;
let reconnectEnabled = true;
let sessionGeneration = 0;
let runtimeGuardInstalled = false;
let missedMessageRecoveryTimer: NodeJS.Timeout | null = null;
let missedMessageRecoveryStartupTimer: NodeJS.Timeout | null = null;
let missedMessageRecoveryGeneration: number | null = null;
let missedMessageRecoveryRunning = false;
let consecutiveMissedMessageRecoveryFailures = 0;
let missedMessageRecoveryWatermarkMs = Date.now();
let bridgeRecoveryPromise: Promise<void> | null = null;
let healthCheckTimer: NodeJS.Timeout | null = null;
let browserListenerTimer: NodeJS.Timeout | null = null;
let healthCheckRunning = false;
let consecutiveHealthCheckFailures = 0;
let healthCheckStartedAtMs = 0;
let lastHealthRecoveryAtMs = 0;
const monitoredBrowsers = new WeakSet<object>();
const RECENT_INBOUND_EVENT_WINDOW_MS = 5 * 60 * 1000;
const MISSED_MESSAGE_RECOVERY_STARTUP_GRACE_MS = 5 * 60 * 1000;
const MISSED_MESSAGE_RECOVERY_SCAN_OVERLAP_MS = 2 * 60 * 1000;
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
    activeWebVersion: null,
    browserPid: null,
    lastRecoverySource: null,
    lastRecoveryAt: null,
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

function currentExpectedWhatsAppNumber() {
    const raw = String(process.env.WA_EXPECTED_NUMBER || "").trim();
    return raw ? normalizePhone(raw) : null;
}

function currentWebJsSendTimeoutMs() {
    return envNumber("WA_WEBJS_SEND_TIMEOUT_MS", 60_000, {
        min: 15_000,
        max: 180_000,
    });
}

function currentWebJsHealthCheckIntervalMs() {
    return envNumber("WA_QR_HEALTHCHECK_MS", 30_000, {
        min: 15_000,
        max: 5 * 60 * 1000,
    });
}

function currentWebJsHealthCheckTimeoutMs() {
    return envNumber("WA_QR_HEALTHCHECK_TIMEOUT_MS", 10_000, {
        min: 3_000,
        max: 30_000,
    });
}

function currentWebJsHealthCheckFailureThreshold() {
    return Math.floor(envNumber("WA_QR_HEALTHCHECK_FAILURE_THRESHOLD", 5, {
        min: 1,
        max: 10,
    }));
}

function currentWebJsHealthRecoveryCooldownMs() {
    return envNumber("WA_QR_HEALTH_RECOVERY_COOLDOWN_MS", 10 * 60_000, {
        min: 60_000,
        max: 60 * 60_000,
    });
}

function currentWebJsDestroyTimeoutMs() {
    return envNumber("WA_QR_CLIENT_DESTROY_TIMEOUT_MS", 10_000, {
        min: 3_000,
        max: 30_000,
    });
}

function currentWebJsAuthTimeoutMs() {
    return envNumber("WA_WEBJS_AUTH_TIMEOUT_MS", 120_000, {
        min: 30_000,
        max: 5 * 60 * 1000,
    });
}

function currentWebJsAuthFailureRetryMs() {
    return envNumber("WA_WEBJS_AUTH_FAILURE_RETRY_MS", 60_000, {
        min: 10_000,
        max: 10 * 60_000,
    });
}

function currentMissedRecoveryFailureThreshold() {
    const legacyThreshold = Number(
        process.env.WA_RECOVERY_FAILURE_RESTART_THRESHOLD || 3
    );
    return envNumber("WA_MISSED_RECOVERY_FAILURE_THRESHOLD", legacyThreshold, {
        min: 1,
        max: 20,
    });
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

function envNumber(name: string, fallback: number, options: { min?: number; max?: number } = {}) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw)) {
        return fallback;
    }

    const min = options.min ?? Number.NEGATIVE_INFINITY;
    const max = options.max ?? Number.POSITIVE_INFINITY;
    return Math.min(Math.max(raw, min), max);
}

function isMissedMessageRecoveryEnabled() {
    const raw = String(process.env.WA_MISSED_MESSAGE_RECOVERY_ENABLED || "true")
        .trim()
        .toLowerCase();
    return raw !== "false" && raw !== "0" && raw !== "off";
}

function currentMissedMessageRecoveryIntervalMs() {
    return envNumber("WA_MISSED_MESSAGE_RECOVERY_INTERVAL_MS", 90_000, {
        min: 30_000,
        max: 10 * 60 * 1000,
    });
}

function currentMissedMessageRecoveryLookbackMs() {
    return envNumber("WA_MISSED_MESSAGE_RECOVERY_LOOKBACK_MS", 6 * 60 * 60 * 1000, {
        min: 5 * 60 * 1000,
        max: 24 * 60 * 60 * 1000,
    });
}

function currentMissedMessageRecoveryChatLimit() {
    return Math.floor(envNumber("WA_MISSED_MESSAGE_RECOVERY_CHAT_LIMIT", 40, {
        min: 5,
        max: 200,
    }));
}

function currentMissedMessageRecoveryMessageLimit() {
    return Math.floor(envNumber("WA_MISSED_MESSAGE_RECOVERY_MESSAGE_LIMIT", 5, {
        min: 1,
        max: 20,
    }));
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

    return {
        type: "local" as const,
        path: currentWebJsVersionCachePath(),
    };
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

function currentWebJsVersionCachePath() {
    const explicit = String(process.env.WA_WEBJS_WEB_VERSION_CACHE_PATH || "").trim();
    return resolve(explicit || join(currentAuthPath(), ".wwebjs_cache"));
}

function currentWebJsRuntimePath() {
    const explicit = String(process.env.WA_WEBJS_RUNTIME_PATH || "").trim();
    return resolve(explicit || join(currentAuthPath(), ".runtime"));
}

async function prepareWhatsAppRuntimePaths() {
    const runtimePath = currentWebJsRuntimePath();
    const cachePath = currentWebJsVersionCachePath();
    const directories = [
        runtimePath,
        join(runtimePath, "tmp"),
        join(runtimePath, "cache"),
        join(runtimePath, "config"),
        join(runtimePath, "chrome-cache"),
        join(runtimePath, "crash-dumps"),
        cachePath,
    ];
    await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));

    const configuredVersion = currentWebJsVersion();
    if (configuredVersion) {
        const target = join(cachePath, `${configuredVersion}.html`);
        const legacySource = resolve(".wwebjs_cache", `${configuredVersion}.html`);
        if (!existsSync(target) && existsSync(legacySource)) {
            await copyFile(legacySource, target);
            logWaQrInfo("Seeded isolated WhatsApp Web cache from legacy cache", {
                configuredVersion,
                source: legacySource,
                target,
            });
        }
    }

    return {
        runtimePath,
        cachePath,
        tmpPath: join(runtimePath, "tmp"),
        xdgCachePath: join(runtimePath, "cache"),
        xdgConfigPath: join(runtimePath, "config"),
        chromeCachePath: join(runtimePath, "chrome-cache"),
        crashDumpsPath: join(runtimePath, "crash-dumps"),
    };
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

function currentWebJsProfilePath() {
    return resolve(currentAuthPath(), `session-${currentWebJsClientId()}`);
}

async function runWithTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    timeoutCode: string
) {
    let timeout: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            task(),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function isProcessAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

async function waitForProcessExit(pid: number, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isProcessAlive(pid)) {
            return true;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    return !isProcessAlive(pid);
}

async function findWhatsAppBrowserRootPids() {
    if (process.platform !== "linux") {
        return [] as number[];
    }

    const profilePath = currentWebJsProfilePath();
    let entries: string[] = [];
    try {
        entries = await readdir("/proc");
    } catch (error) {
        logWaQrWarn("Unable to inspect browser processes", { error });
        return [] as number[];
    }

    const matches = await Promise.all(
        entries
            .filter((entry) => /^\d+$/.test(entry))
            .map(async (entry) => {
                try {
                    const commandLine = await readFile(`/proc/${entry}/cmdline`, "utf8");
                    return isWhatsAppBrowserProcessForProfile(commandLine, profilePath)
                        ? Number(entry)
                        : null;
                } catch {
                    return null;
                }
            })
    );

    return matches.filter(
        (pid): pid is number => typeof pid === "number" && Number.isInteger(pid) && pid > 0
    );
}

async function terminateBrowserPids(pids: number[]) {
    const uniquePids = Array.from(new Set(pids)).filter(
        (pid) => pid > 1 && pid !== process.pid && isProcessAlive(pid)
    );
    if (uniquePids.length === 0) {
        return [] as number[];
    }

    for (const pid of uniquePids) {
        try {
            process.kill(pid, "SIGTERM");
        } catch {
            // Process may have already exited.
        }
    }

    await Promise.all(uniquePids.map((pid) => waitForProcessExit(pid, 2_000)));

    for (const pid of uniquePids) {
        if (!isProcessAlive(pid)) {
            continue;
        }
        try {
            process.kill(pid, "SIGKILL");
        } catch {
            // Process may have already exited.
        }
    }

    await Promise.all(uniquePids.map((pid) => waitForProcessExit(pid, 2_000)));
    return uniquePids.filter((pid) => !isProcessAlive(pid));
}

async function cleanupStaleWhatsAppBrowsers(source: string) {
    const pids = await findWhatsAppBrowserRootPids();
    if (pids.length === 0) {
        return [] as number[];
    }

    logWaQrWarn("Stale WhatsApp browser processes detected", {
        source,
        pids,
        profilePath: currentWebJsProfilePath(),
    });
    await recordWhatsAppAlert({
        eventCode: "whatsapp_browser_duplicate_detected",
        component: "wa:qr",
        message: "Browser WhatsApp lama atau duplikat terdeteksi dan sedang dibersihkan.",
        severity: "critical",
        workspaceSlug: currentActiveClientSlug(),
        dedupeKey: "browser-profile",
        metadata: {
            source,
            pids,
            profilePath: currentWebJsProfilePath(),
        },
    });

    const terminatedPids = await terminateBrowserPids(pids);
    logWaQrWarn("Stale WhatsApp browser cleanup completed", {
        source,
        detectedPids: pids,
        terminatedPids,
    });
    await recordWhatsAppAlert({
        eventCode: "whatsapp_browser_forced_cleanup",
        component: "wa:qr",
        message: "Browser WhatsApp lama dihentikan agar hanya satu sesi aktif per workspace.",
        severity: terminatedPids.length === pids.length ? "warning" : "critical",
        workspaceSlug: currentActiveClientSlug(),
        dedupeKey: "browser-profile",
        metadata: { source, detectedPids: pids, terminatedPids },
    });
    return terminatedPids;
}

async function destroyWhatsAppClientCompletely(client: WebJsClient, source: string) {
    const browserPid = client.pupBrowser?.process?.()?.pid;
    let destroyError: unknown = null;

    try {
        await runWithTimeout(
            () => client.destroy(),
            currentWebJsDestroyTimeoutMs(),
            "WA_CLIENT_DESTROY_TIMEOUT"
        );
    } catch (error) {
        destroyError = error;
        logWaQrWarn("WhatsApp client destroy did not complete cleanly", {
            source,
            browserPid: browserPid || null,
            error,
        });
    }

    if (client.pupBrowser?.isConnected?.()) {
        try {
            await runWithTimeout(
                () => client.pupBrowser!.close!(),
                currentWebJsDestroyTimeoutMs(),
                "WA_BROWSER_CLOSE_TIMEOUT"
            );
        } catch (error) {
            destroyError ||= error;
            logWaQrWarn("WhatsApp browser close did not complete cleanly", {
                source,
                browserPid: browserPid || null,
                error,
            });
        }
    }

    if (browserPid && isProcessAlive(browserPid)) {
        await terminateBrowserPids([browserPid]);
    }
    const terminatedPids = await cleanupStaleWhatsAppBrowsers(source);

    if (destroyError) {
        await recordWhatsAppAlert({
            eventCode: "whatsapp_client_destroy_failed",
            component: "wa:qr",
            message: "Cleanup normal browser WhatsApp gagal dan dilanjutkan dengan force cleanup.",
            severity: "error",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "browser-profile",
            metadata: {
                source,
                browserPid: browserPid || null,
                terminatedPids,
                error: readErrorMessage(destroyError),
            },
        });
    }
}

function stopWhatsAppHealthCheck() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
    if (browserListenerTimer) {
        clearInterval(browserListenerTimer);
        browserListenerTimer = null;
    }
    healthCheckRunning = false;
    consecutiveHealthCheckFailures = 0;
    healthCheckStartedAtMs = 0;
}

function attachWhatsAppBrowserDisconnectListener(
    generation: number,
    client: WebJsClient
) {
    const browser = client.pupBrowser;
    if (!browser || typeof browser.on !== "function") {
        return false;
    }
    if (monitoredBrowsers.has(browser as object)) {
        return true;
    }

    monitoredBrowsers.add(browser as object);
    updateRuntimeState({ browserPid: browser.process?.()?.pid || null });
    browser.on("disconnected", () => {
        if (
            generation !== sessionGeneration ||
            clientRef !== client ||
            !reconnectEnabled
        ) {
            return;
        }

        const error = new Error("WA_BROWSER_DISCONNECTED");
        logWaQrError("WhatsApp Chromium process disconnected", {
            generation,
            browserPid: browser.process?.()?.pid || null,
            status: runtimeState.status,
        });
        void recordWhatsAppAlert({
            eventCode: "whatsapp_browser_disconnected",
            component: "wa:qr",
            message: "Proses browser WhatsApp berhenti sebelum sesi ditutup dengan benar.",
            severity: "critical",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "browser-session",
            metadata: {
                generation,
                status: runtimeState.status,
            },
        });
        if (shouldRestartWhatsAppBridge({ signal: "browser_disconnected" })) {
            void recoverWhatsAppQrBridge("whatsapp_browser_disconnected", error);
        }
    });
    return true;
}

async function runWhatsAppHealthCheck(generation: number, client: WebJsClient) {
    if (
        healthCheckRunning ||
        generation !== sessionGeneration ||
        clientRef !== client ||
        runtimeState.status !== "connected"
    ) {
        return;
    }

    healthCheckRunning = true;
    try {
        const browser = client.pupBrowser;
        if (!browser) {
            const startupAgeMs = Date.now() - healthCheckStartedAtMs;
            if (startupAgeMs < currentWebJsAuthTimeoutMs()) {
                return;
            }
            throw new Error("WA_BROWSER_NOT_CREATED");
        }
        attachWhatsAppBrowserDisconnectListener(generation, client);
        if (client.pupPage?.isClosed?.()) {
            throw new Error("WA_BROWSER_PAGE_CLOSED");
        }
        if (browser.isConnected && !browser.isConnected()) {
            throw new Error("WA_BROWSER_DISCONNECTED");
        }
        if (runtimeState.status !== "connected") {
            consecutiveHealthCheckFailures = 0;
            return;
        }
        if (typeof client.getState !== "function") {
            throw new Error("WA_CLIENT_STATE_UNAVAILABLE");
        }

        const state = await runWithTimeout(
            () => client.getState!(),
            currentWebJsHealthCheckTimeoutMs(),
            "WA_HEALTHCHECK_TIMEOUT"
        );
        if (!isHealthyWhatsAppClientState(state)) {
            throw new Error(`WA_CLIENT_STATE_${String(state || "UNKNOWN").toUpperCase()}`);
        }

        const hadFailures = consecutiveHealthCheckFailures > 0;
        consecutiveHealthCheckFailures = 0;
        markConnectedState(String(state).toUpperCase());
        if (hadFailures) {
            await resolveWhatsAppAlert({
                eventCode: "whatsapp_healthcheck_failed",
                workspaceSlug: currentActiveClientSlug(),
                dedupeKey: "browser-session",
            });
        }
    } catch (error) {
        consecutiveHealthCheckFailures += 1;
        const failureThreshold = currentWebJsHealthCheckFailureThreshold();
        logWaQrWarn("WhatsApp browser health check failed", {
            generation,
            consecutiveFailures: consecutiveHealthCheckFailures,
            failureThreshold,
            error,
        });
        await recordWhatsAppAlert({
            eventCode: "whatsapp_healthcheck_failed",
            component: "wa:qr",
            message: "Browser WhatsApp tidak merespons health check.",
            severity: consecutiveHealthCheckFailures >= failureThreshold ? "critical" : "warning",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "browser-session",
            metadata: {
                generation,
                consecutiveFailures: consecutiveHealthCheckFailures,
                failureThreshold,
                error: readErrorMessage(error),
            },
        });

        const errorMessage = readErrorMessage(error);
        const hardBrowserFailure =
            errorMessage === "WA_BROWSER_DISCONNECTED" ||
            errorMessage === "WA_BROWSER_PAGE_CLOSED" ||
            errorMessage === "WA_BROWSER_NOT_CREATED";
        const shouldRecover = shouldRestartWhatsAppBridge({
            signal: hardBrowserFailure
                ? errorMessage === "WA_BROWSER_PAGE_CLOSED"
                    ? "browser_page_closed"
                    : "browser_disconnected"
                : "health_check_failed",
            consecutiveFailures: consecutiveHealthCheckFailures,
            failureThreshold,
        });

        if (shouldRecover) {
            const now = Date.now();
            const cooldownMs = currentWebJsHealthRecoveryCooldownMs();
            const cooldownRemainingMs = Math.max(
                0,
                lastHealthRecoveryAtMs + cooldownMs - now
            );
            if (!hardBrowserFailure && cooldownRemainingMs > 0) {
                logWaQrWarn("WhatsApp health recovery suppressed by cooldown", {
                    generation,
                    cooldownRemainingMs,
                    error,
                });
                consecutiveHealthCheckFailures = 0;
                return;
            }

            lastHealthRecoveryAtMs = now;
            stopWhatsAppHealthCheck();
            await recoverWhatsAppQrBridge("whatsapp_healthcheck_failed", error);
        }
    } finally {
        healthCheckRunning = false;
    }
}

function startWhatsAppHealthCheck(generation: number, client: WebJsClient) {
    stopWhatsAppHealthCheck();
    healthCheckStartedAtMs = Date.now();
    const intervalMs = currentWebJsHealthCheckIntervalMs();
    browserListenerTimer = setInterval(() => {
        if (attachWhatsAppBrowserDisconnectListener(generation, client)) {
            clearInterval(browserListenerTimer!);
            browserListenerTimer = null;
        }
    }, 1_000);
    browserListenerTimer.unref?.();
    healthCheckTimer = setInterval(() => {
        void runWhatsAppHealthCheck(generation, client);
    }, intervalMs);
    healthCheckTimer.unref?.();

    logWaQrInfo("WhatsApp browser health check started", {
        generation,
        intervalMs,
        failureThreshold: currentWebJsHealthCheckFailureThreshold(),
    });
}

function scheduleBridgeRestart(delayMs = 2500) {
    setTimeout(() => {
        if (!reconnectEnabled || clientRef) {
            return;
        }
        if (isStarting || bridgeRecoveryPromise) {
            scheduleBridgeRestart(delayMs);
            return;
        }
        void startWhatsAppQrBridge();
    }, delayMs);
}

export async function recoverWhatsAppQrBridge(
    source: string,
    error?: unknown,
    options: { reconnect?: boolean; status?: "disconnected" | "error" } = {}
) {
    if (currentProvider() !== "qr_local") {
        return;
    }

    if (bridgeRecoveryPromise) {
        return bridgeRecoveryPromise;
    }

    const shouldReconnect = options.reconnect !== false;
    const message = error ? readErrorMessage(error) : source;
    const client = clientRef;
    clientRef = null;
    sessionGeneration += 1;
    stopMissedMessageRecovery();
    stopWhatsAppHealthCheck();
    clearActiveWhatsAppNumber();
    updateRuntimeState({
        status: options.status || "disconnected",
        lastError: message,
        activeWaNumber: null,
        activeWebVersion: null,
        browserPid: null,
        lastClientState: null,
        lastRecoverySource: source,
        lastRecoveryAt: new Date().toISOString(),
        qr: null,
        qrImageUrl: null,
    });

    waQrLogger.warn("Recovering unhealthy WhatsApp QR bridge", {
        source,
        error,
        reconnect: shouldReconnect,
        activeClientSlug: currentActiveClientSlug(),
    });
    void recordWhatsAppAlert({
        eventCode: "bridge_recovery",
        component: "wa:qr",
        message: "Sesi WhatsApp tidak sehat dan sedang dipulihkan otomatis.",
        severity: "warning",
        workspaceSlug: currentActiveClientSlug(),
        dedupeKey: source,
        metadata: {
            source,
            error: message,
            reconnect: shouldReconnect,
        },
    });

    bridgeRecoveryPromise = (async () => {
        if (client) {
            await destroyWhatsAppClientCompletely(client, source);
        } else {
            await cleanupStaleWhatsAppBrowsers(source);
        }
    })().finally(() => {
        bridgeRecoveryPromise = null;
        if (shouldReconnect && reconnectEnabled) {
            scheduleBridgeRestart();
        }
    });

    return bridgeRecoveryPromise;
}

function handleTransientRuntimeError(source: string, error: unknown) {
    markErrorAsHandled(error);
    const client = clientRef;
    const browserConnected = Boolean(client?.pupBrowser?.isConnected?.());
    const pageClosed = Boolean(client?.pupPage?.isClosed?.());
    const signal = !browserConnected
        ? "browser_disconnected"
        : pageClosed
            ? "browser_page_closed"
            : "runtime_navigation_error";

    void recordWhatsAppAlert({
        eventCode: "whatsapp_transient_runtime_error",
        component: "wa:qr",
        message: "WhatsApp Web mengalami error runtime sementara.",
        severity: signal === "runtime_navigation_error" ? "warning" : "error",
        workspaceSlug: currentActiveClientSlug(),
        dedupeKey: source,
        metadata: {
            source,
            browserConnected,
            pageClosed,
            error: readErrorMessage(error),
        },
    });

    if (shouldRestartWhatsAppBridge({ signal })) {
        void recoverWhatsAppQrBridge(source, error);
        return;
    }

    if (client) {
        void runWhatsAppHealthCheck(sessionGeneration, client);
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

function toEpochMs(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
}

function getMessageTimestampMs(message: any) {
    return (
        toEpochMs(message?.timestamp) ||
        toEpochMs(message?._data?.timestamp) ||
        toEpochMs(message?._data?.t) ||
        null
    );
}

function getChatTimestampMs(chat: WebJsChat) {
    return (
        toEpochMs(chat?.timestamp) ||
        getMessageTimestampMs(chat?.lastMessage) ||
        null
    );
}

function getChatSerializedId(chat: WebJsChat) {
    const id = chat?.id;
    if (typeof id === "string") {
        return normalizeChatId(id);
    }
    if (typeof id?._serialized === "string") {
        return normalizeChatId(id._serialized);
    }
    return getEventChatId(chat?.lastMessage);
}

function isRecoverablePrivateChat(chat: WebJsChat) {
    if (chat?.isGroup) {
        return false;
    }
    return isPrivateUserChat(getChatSerializedId(chat));
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

function toSendError(error: string, errorCode?: string): QrSendResult {
    return {
        sent: false,
        provider: "qr_local" as const,
        error,
        errorCode,
    };
}

function getWhatsAppTrafficReadinessError() {
    if (!clientRef || runtimeState.status !== "connected") {
        return {
            code: "WA_SESSION_NOT_CONNECTED",
            message: "QR WhatsApp client is not connected yet",
        };
    }

    const identity = validateWorkspaceWhatsAppIdentity({
        expectedNumber: currentExpectedWhatsAppNumber(),
        connectedNumber: runtimeState.activeWaNumber,
    });
    if (!identity.valid) {
        return {
            code: "WA_WORKSPACE_IDENTITY_MISMATCH",
            message: `WhatsApp session identity is not ready (${identity.reason})`,
        };
    }

    return null;
}

async function runWithWhatsAppSendTimeout<T>(task: () => Promise<T>) {
    const timeoutMs = currentWebJsSendTimeoutMs();
    let timeout: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            task(),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => {
                    reject(new Error(`WA_SEND_TIMEOUT:${timeoutMs}`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
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

    const trafficReadinessError = getWhatsAppTrafficReadinessError();
    if (trafficReadinessError) {
        logIgnoredWhatsAppEvent(message, trafficReadinessError.code);
        await recordWhatsAppAlert({
            eventCode: "inbound_ignored_session_not_ready",
            component: "wa:qr",
            message: "Event pesan masuk diterima saat sesi WhatsApp belum siap dan menunggu recovery.",
            severity: "error",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: getInboundProviderMessageId(message) || trafficReadinessError.code,
            metadata: {
                readinessCode: trafficReadinessError.code,
                error: trafficReadinessError.message,
            },
        });
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
        await recordWhatsAppAlert({
            eventCode: "inbound_workspace_missing",
            component: "wa:qr",
            message: "Pesan WhatsApp masuk tidak dapat diproses karena workspace aktif belum diset.",
            severity: "critical",
            dedupeKey: providerMessageId || fromWa,
            metadata: { fromWa, providerMessageId },
        });
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
        await recordWhatsAppAlert({
            eventCode: "inbound_workspace_not_found",
            component: "wa:qr",
            message: "Pesan WhatsApp masuk tidak dapat diproses karena workspace tidak ditemukan.",
            severity: "critical",
            workspaceSlug: activeClientSlug,
            dedupeKey: providerMessageId || fromWa,
            metadata: { fromWa, providerMessageId },
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

        const { sendWhatsAppText } = await import("./whatsapp-provider.service");
        const replyResult = await sendWhatsAppText(fromWa, autoReplyText);

        if (!replyResult.sent) {
            logWaQrError("Auto-reply failed", {
                fromWa,
                jid: inboundReplyJid || phoneToChatId(fromWa),
                error: replyResult.error || "unknown error",
            });
            await recordWhatsAppAlert({
                eventCode: "customer_auto_reply_failed",
                component: "wa:qr",
                message: "Auto-reply ke calon customer gagal dikirim.",
                severity: "error",
                clientId: activeClientId,
                leadId: result.lead?.id || null,
                dedupeKey: providerMessageId || fromWa,
                metadata: {
                    fromWa,
                    error: replyResult.error || "unknown error",
                },
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
        await recordWhatsAppAlert({
            eventCode: "inbound_handler_failed",
            component: "wa:qr",
            message: "Pesan WhatsApp masuk gagal diproses oleh sistem.",
            severity: "critical",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: getInboundProviderMessageId(message) || eventName,
            metadata: {
                eventName,
                error: readErrorMessage(error),
            },
        });
    }
}

async function fetchRecoveryMessages(chat: WebJsChat) {
    const fallbackMessages = chat.lastMessage ? [chat.lastMessage] : [];

    if (typeof chat.fetchMessages !== "function") {
        return fallbackMessages;
    }

    try {
        const messages = await chat.fetchMessages({
            limit: currentMissedMessageRecoveryMessageLimit(),
        });
        return Array.isArray(messages) && messages.length > 0 ? messages : fallbackMessages;
    } catch (error) {
        if (fallbackMessages.length > 0) {
            if (isQrDebugEnabled()) {
                logWaQrWarn("Missed-message recovery using last message fallback", {
                    chatId: getChatSerializedId(chat),
                    errorName: error instanceof Error ? error.name : typeof error,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
            }
            return fallbackMessages;
        }
        throw error;
    }
}

async function runMissedMessageRecovery(generation: number, client: WebJsClient) {
    if (
        missedMessageRecoveryRunning ||
        generation !== sessionGeneration ||
        clientRef !== client ||
        runtimeState.status !== "connected"
    ) {
        return;
    }

    if (typeof client.getChats !== "function") {
        return;
    }

    missedMessageRecoveryRunning = true;
    const scanStartedAt = Date.now();
    const lookbackCutoffMs = scanStartedAt - currentMissedMessageRecoveryLookbackMs();
    const watermarkCutoffMs = missedMessageRecoveryWatermarkMs - MISSED_MESSAGE_RECOVERY_SCAN_OVERLAP_MS;
    const cutoffMs = Math.max(lookbackCutoffMs, watermarkCutoffMs);
    let scannedChats = 0;
    let scannedMessages = 0;
    let recoveredMessages = 0;

    try {
        const chats = await client.getChats();
        const candidates = chats
            .map((chat) => ({
                chat,
                lastMessageAt: getChatTimestampMs(chat),
                unreadCount: Math.max(0, Number(chat?.unreadCount || 0)),
            }))
            .filter((item) => {
                if (!isRecoverablePrivateChat(item.chat)) {
                    return false;
                }
                if (!item.lastMessageAt || item.lastMessageAt < lookbackCutoffMs) {
                    return false;
                }
                return item.unreadCount > 0 || item.lastMessageAt >= cutoffMs;
            })
            .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
            .slice(0, currentMissedMessageRecoveryChatLimit());

        for (const item of candidates) {
            scannedChats += 1;
            let messages: any[] = [];
            try {
                messages = await fetchRecoveryMessages(item.chat);
            } catch (error) {
                if (isQrDebugEnabled()) {
                    logWaQrWarn("Missed-message recovery failed fetching chat messages", {
                        chatId: getChatSerializedId(item.chat),
                        error,
                        errorName: error instanceof Error ? error.name : typeof error,
                        errorMessage: error instanceof Error ? error.message : String(error),
                    });
                }
                continue;
            }

            const orderedMessages = messages
                .filter(Boolean)
                .sort((a, b) => (getMessageTimestampMs(a) || 0) - (getMessageTimestampMs(b) || 0));
            const messageCutoffMs = item.unreadCount > 0 ? lookbackCutoffMs : cutoffMs;

            for (const message of orderedMessages) {
                const messageAt = getMessageTimestampMs(message) || item.lastMessageAt;
                if (!messageAt || messageAt < messageCutoffMs) {
                    continue;
                }
                if (!getInboundProviderMessageId(message)) {
                    continue;
                }

                const ignoreDecision = shouldIgnoreWhatsAppEvent(message);
                if (ignoreDecision.ignore) {
                    continue;
                }

                scannedMessages += 1;
                await handleIncomingMessage(message);
                recoveredMessages += 1;
            }
        }

        consecutiveMissedMessageRecoveryFailures = 0;
        await resolveWhatsAppAlert({
            eventCode: "missed_message_recovery_failed",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "scanner",
        });
        await resolveWhatsAppAlert({
            eventCode: "missed_message_recovery_disabled",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "scanner",
        });
        missedMessageRecoveryWatermarkMs = Math.max(missedMessageRecoveryWatermarkMs, scanStartedAt);
        if (recoveredMessages > 0 || isQrDebugEnabled()) {
            logWaQrInfo("Missed-message recovery scan completed", {
                scannedChats,
                scannedMessages,
                recoveredMessages,
                cutoffAt: new Date(cutoffMs).toISOString(),
            });
        }
    } catch (error) {
        consecutiveMissedMessageRecoveryFailures += 1;
        logWaQrWarn("Missed-message recovery scan failed", { error });
        await recordWhatsAppAlert({
            eventCode: "missed_message_recovery_failed",
            component: "wa:qr",
            message: "Scanner pemulihan pesan WhatsApp gagal membaca recent chat.",
            severity: "warning",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "scanner",
            metadata: {
                consecutiveFailures: consecutiveMissedMessageRecoveryFailures,
                error: readErrorMessage(error),
            },
        });
        const failureThreshold = currentMissedRecoveryFailureThreshold();
        if (
            shouldDisableMissedMessageRecovery(
                consecutiveMissedMessageRecoveryFailures,
                failureThreshold
            )
        ) {
            logWaQrWarn(
                "Missed-message recovery disabled after repeated failures; primary WhatsApp session remains connected",
                {
                    consecutiveFailures: consecutiveMissedMessageRecoveryFailures,
                    failureThreshold,
                }
            );
            await recordWhatsAppAlert({
                eventCode: "missed_message_recovery_disabled",
                component: "wa:qr",
                message: "Scanner pemulihan pesan dinonaktifkan; sesi utama tetap terhubung.",
                severity: "error",
                workspaceSlug: currentActiveClientSlug(),
                dedupeKey: "scanner",
                metadata: {
                    consecutiveFailures: consecutiveMissedMessageRecoveryFailures,
                    failureThreshold,
                },
            });
            stopMissedMessageRecovery();
        }
    } finally {
        missedMessageRecoveryRunning = false;
    }
}

function stopMissedMessageRecovery() {
    if (missedMessageRecoveryTimer) {
        clearInterval(missedMessageRecoveryTimer);
        missedMessageRecoveryTimer = null;
    }
    if (missedMessageRecoveryStartupTimer) {
        clearTimeout(missedMessageRecoveryStartupTimer);
        missedMessageRecoveryStartupTimer = null;
    }
    missedMessageRecoveryGeneration = null;
    missedMessageRecoveryRunning = false;
    consecutiveMissedMessageRecoveryFailures = 0;
}

function startMissedMessageRecovery(generation: number, client: WebJsClient) {
    if (
        missedMessageRecoveryTimer &&
        missedMessageRecoveryGeneration === generation &&
        clientRef === client
    ) {
        return;
    }

    stopMissedMessageRecovery();

    if (!isMissedMessageRecoveryEnabled()) {
        return;
    }

    if (typeof client.getChats !== "function") {
        logWaQrWarn("Missed-message recovery disabled: getChats is unavailable");
        void recordWhatsAppAlert({
            eventCode: "missed_message_recovery_unavailable",
            component: "wa:qr",
            message: "Scanner pemulihan pesan tidak tersedia pada WhatsApp Web client.",
            severity: "error",
            workspaceSlug: currentActiveClientSlug(),
            dedupeKey: "scanner",
        });
        return;
    }

    missedMessageRecoveryWatermarkMs = Date.now() - MISSED_MESSAGE_RECOVERY_STARTUP_GRACE_MS;

    const intervalMs = currentMissedMessageRecoveryIntervalMs();
    missedMessageRecoveryGeneration = generation;
    missedMessageRecoveryTimer = setInterval(() => {
        void runMissedMessageRecovery(generation, client);
    }, intervalMs);
    missedMessageRecoveryTimer.unref?.();

    missedMessageRecoveryStartupTimer = setTimeout(() => {
        missedMessageRecoveryStartupTimer = null;
        void runMissedMessageRecovery(generation, client);
    }, Math.min(15_000, intervalMs));
    missedMessageRecoveryStartupTimer.unref?.();

    logWaQrInfo("Missed-message recovery started", {
        intervalMs,
        lookbackMs: currentMissedMessageRecoveryLookbackMs(),
        chatLimit: currentMissedMessageRecoveryChatLimit(),
        messageLimit: currentMissedMessageRecoveryMessageLimit(),
    });
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

    const readinessError = getWhatsAppTrafficReadinessError();
    if (readinessError) {
        return toSendError(readinessError.message, readinessError.code);
    }

    return sendWhatsAppQrTextByJid(phoneToChatId(to), body);
}

export async function inspectRecentOutboundWhatsAppText(params: {
    to: string;
    marker: string;
    sentAfter: Date;
}) {
    const readinessError = getWhatsAppTrafficReadinessError();
    if (readinessError) {
        return {
            status: "unavailable" as const,
            error: readinessError.message,
        };
    }

    const activeClient = clientRef!;
    if (!activeClient.searchMessages) {
        return {
            status: "unavailable" as const,
            error: "WhatsApp message search is unavailable",
        };
    }

    const chatId = phoneToChatId(params.to);
    const minimumTimestamp = Math.floor(params.sentAfter.getTime() / 1000) - 60;

    try {
        let timeout: NodeJS.Timeout | null = null;
        const messages = await Promise.race([
            activeClient.searchMessages(params.marker, {
                chatId,
                limit: 20,
            }),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new Error("WA_OUTBOUND_RECONCILIATION_TIMEOUT")),
                    15_000
                );
            }),
        ]).finally(() => {
            if (timeout) {
                clearTimeout(timeout);
            }
        });
        const match = messages.find(
            (message) =>
                message.fromMe === true &&
                String(message.body || "").includes(params.marker) &&
                Number(message.timestamp || 0) >= minimumTimestamp
        );

        if (!match) {
            return { status: "not_found" as const };
        }

        const providerMessageId =
            typeof match.id === "string"
                ? match.id
                : match.id?._serialized;
        return {
            status: "found" as const,
            providerMessageId: providerMessageId || null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        waQrLogger.error("Failed reconciling uncertain outbound WhatsApp message", {
            to: params.to,
            marker: params.marker,
            error,
        });
        return {
            status: "unavailable" as const,
            error: message,
        };
    }
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

    const readinessError = getWhatsAppTrafficReadinessError();
    if (readinessError) {
        return toSendError(readinessError.message, readinessError.code);
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

    const readinessError = getWhatsAppTrafficReadinessError();
    if (readinessError) {
        return toSendError(readinessError.message, readinessError.code);
    }

    const activeClient = clientRef!;

    const chatId = normalizeChatId(jid);
    if (!chatId) {
        return toSendError("Invalid WhatsApp chat id");
    }

    try {
        if (typeof payload?.text === "string") {
            const response = await runWithWhatsAppSendTimeout(() =>
                activeClient.sendMessage(chatId, payload.text)
            );
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
            const response = await runWithWhatsAppSendTimeout(() =>
                activeClient.sendMessage(chatId, media, options)
            );
            return toSendResult(response);
        }

        const response = await runWithWhatsAppSendTimeout(() =>
            activeClient.sendMessage(chatId, payload)
        );
        return toSendResult(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.startsWith("WA_SEND_TIMEOUT")) {
            void recordWhatsAppAlert({
                eventCode: "whatsapp_send_timeout",
                component: "wa:qr",
                message: "Pengiriman WhatsApp melewati batas waktu dan akan direkonsiliasi tanpa me-restart sesi.",
                severity: "error",
                workspaceSlug: currentActiveClientSlug(),
                dedupeKey: chatId,
                metadata: { chatId, error: message },
            });
            return toSendError(message, "WA_SEND_TIMEOUT");
        }
        return toSendError(message, "WA_SEND_FAILED");
    }
}

export async function stopWhatsAppQrBridge() {
    reconnectEnabled = false;
    sessionGeneration += 1;
    stopMissedMessageRecovery();
    stopWhatsAppHealthCheck();
    clearActiveWhatsAppNumber();

    const client = clientRef;
    clientRef = null;

    if (bridgeRecoveryPromise) {
        await bridgeRecoveryPromise;
    }
    if (client) {
        await destroyWhatsAppClientCompletely(client, "manual_stop");
    } else {
        await cleanupStaleWhatsAppBrowsers("manual_stop");
    }

    updateRuntimeState({
        status: "disconnected",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
        pairingPhone: null,
        activeWaNumber: null,
        activeWebVersion: null,
        browserPid: null,
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
        activeWebVersion: null,
        browserPid: null,
        lastClientState: null,
        lastError: null,
        lastDisconnectCode: null,
    });
}

export async function startWhatsAppQrBridge() {
    installRuntimeGuard();

    if (currentProvider() !== "qr_local") {
        stopMissedMessageRecovery();
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

    if (clientRef || isStarting || bridgeRecoveryPromise) {
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
        activeWebVersion: null,
        browserPid: null,
        lastClientState: null,
        lastError: null,
        activeClientSlug: currentActiveClientSlug(),
    });

    let startingClient: WebJsClient | null = null;
    try {
        await cleanupStaleWhatsAppBrowsers("before_start");
        if (generation !== sessionGeneration || !reconnectEnabled) {
            return;
        }

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
        const runtimePaths = await prepareWhatsAppRuntimePaths();
        const sessionIsolation = describeSessionIsolation();
        const puppeteerArgs = [
            ...currentWebJsPuppeteerArgs(),
            `--disk-cache-dir=${runtimePaths.chromeCachePath}`,
            `--crash-dumps-dir=${runtimePaths.crashDumpsPath}`,
        ];
        const puppeteerOptions: Record<string, unknown> = {
            headless: currentWebJsHeadless(),
            args: puppeteerArgs,
            env: {
                ...process.env,
                TMPDIR: runtimePaths.tmpPath,
                XDG_CACHE_HOME: runtimePaths.xdgCachePath,
                XDG_CONFIG_HOME: runtimePaths.xdgConfigPath,
            },
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
            authTimeoutMs: currentWebJsAuthTimeoutMs(),
            puppeteer: puppeteerOptions,
            userAgent,
        });

        startingClient = client;
        clientRef = client;
        logWaQrInfo("Starting WhatsApp QR bridge", {
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
            webVersionCachePath: runtimePaths.cachePath,
            runtimePath: runtimePaths.runtimePath,
            authTimeoutMs: currentWebJsAuthTimeoutMs(),
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
            logWaQrInfo("QR updated", { status: "awaiting_qr" });
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
            logWaQrInfo("WhatsApp QR authenticated", { status: "starting" });
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

        let readyHandled = false;
        client.on("ready", () => {
            void (async () => {
                if (generation !== sessionGeneration || readyHandled) {
                    return;
                }
                readyHandled = true;

                const activeWaNumber = resolveConnectedAccountPhone(client);
                const identity = validateWorkspaceWhatsAppIdentity({
                    expectedNumber: currentExpectedWhatsAppNumber(),
                    connectedNumber: activeWaNumber,
                });

                if (!identity.valid) {
                    const message =
                        identity.reason === "number_mismatch"
                            ? `Nomor WhatsApp ${identity.connectedNumber || "-"} tidak cocok dengan workspace ${currentActiveClientSlug() || "-"}; expected ${identity.expectedNumber || "-"}.`
                            : `Nomor WhatsApp aktif tidak dapat diverifikasi untuk workspace ${currentActiveClientSlug() || "-"}.`;
                    waQrLogger.error("WhatsApp workspace identity rejected", {
                        activeClientSlug: currentActiveClientSlug(),
                        ...identity,
                    });
                    await recordWhatsAppAlert({
                        eventCode: "workspace_identity_rejected",
                        component: "wa:qr",
                        message,
                        severity: "critical",
                        workspaceSlug: currentActiveClientSlug(),
                        dedupeKey: "identity",
                        metadata: identity,
                    });
                    await recoverWhatsAppQrBridge(
                        "workspace_identity_rejected",
                        new Error(message),
                        {
                            reconnect: identity.reason !== "number_mismatch",
                            status: "error",
                        }
                    );
                    return;
                }

                setActiveWhatsAppNumber(activeWaNumber);
                const activeWebVersion = client.getWWebVersion
                    ? await runWithTimeout(
                        () => client.getWWebVersion!(),
                        10_000,
                        "WA_WEB_VERSION_READ_TIMEOUT"
                    ).catch((error) => {
                        logWaQrWarn("Failed reading active WhatsApp Web version", { error });
                        return null;
                    })
                    : null;
                updateRuntimeState({
                    activeWaNumber,
                    activeWebVersion,
                    browserPid: client.pupBrowser?.process?.()?.pid || null,
                });
                markConnectedState("READY");
                logWaQrInfo("WhatsApp QR connected", {
                    activeWaNumber: activeWaNumber || null,
                    activeWebVersion,
                    browserPid: client.pupBrowser?.process?.()?.pid || null,
                    activeClientSlug: currentActiveClientSlug(),
                    expectedWaNumber: identity.expectedNumber,
                });
                startMissedMessageRecovery(generation, client);
                startWhatsAppHealthCheck(generation, client);

                const activeClientSlug = currentActiveClientSlug();
                const activeClient = activeClientSlug
                    ? await getClientBySlug(activeClientSlug)
                    : null;
                if (activeClient?.id) {
                    await resolveWhatsAppAlertsForClient(activeClient.id, [
                        "bridge_recovery",
                        "whatsapp_disconnected",
                        "whatsapp_auth_failure",
                        "workspace_identity_rejected",
                        "whatsapp_healthcheck_failed",
                        "whatsapp_browser_disconnected",
                        "whatsapp_browser_duplicate_detected",
                        "whatsapp_browser_forced_cleanup",
                        "whatsapp_client_destroy_failed",
                    ]);
                    const { processPendingWhatsAppOutbox } = await import(
                        "./whatsapp-outbox.service"
                    );
                    try {
                        await processPendingWhatsAppOutbox(activeClient.id);
                    } catch (error) {
                        logWaQrError("Failed flushing WhatsApp outbox after reconnect", {
                            clientId: activeClient.id,
                            error,
                        });
                        await recordWhatsAppAlert({
                            eventCode: "outbox_reconnect_flush_failed",
                            component: "wa:qr",
                            message: "Antrean balasan tertunda gagal diproses segera setelah reconnect.",
                            severity: "error",
                            clientId: activeClient.id,
                            dedupeKey: "ready-flush",
                            metadata: { error: readErrorMessage(error) },
                        });
                    }
                    const { resumePausedDistributions } = await import("./distribution.service");
                    const resumed = await resumePausedDistributions(activeClient.id);
                    if (resumed > 0) {
                        waQrLogger.info("Paused distributions resumed", {
                            activeClientSlug,
                            clientId: activeClient.id,
                            resumed,
                        });
                    }
                }
            })().catch((error) => {
                waQrLogger.error("Failed finalizing WhatsApp QR ready state", { error });
                void recordWhatsAppAlert({
                    eventCode: "ready_state_failure",
                    component: "wa:qr",
                    message: "Sesi WhatsApp terhubung, tetapi sinkronisasi data pendukung gagal.",
                    severity: "error",
                    workspaceSlug: currentActiveClientSlug(),
                    dedupeKey: "ready-finalization",
                    metadata: { error: readErrorMessage(error) },
                });
            });
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
            void recordWhatsAppAlert({
                eventCode: "whatsapp_auth_failure",
                component: "wa:qr",
                message: "Autentikasi sesi WhatsApp gagal.",
                severity: "critical",
                workspaceSlug: currentActiveClientSlug(),
                dedupeKey: "session",
                metadata: { error: message || "Authentication failure" },
            });
            setTimeout(() => {
                if (generation === sessionGeneration) {
                    void recoverWhatsAppQrBridge(
                        "whatsapp_auth_failure",
                        new Error(message || "Authentication failure")
                    );
                }
            }, currentWebJsAuthFailureRetryMs());
        });

        client.on("disconnected", (reason: string) => {
            if (generation !== sessionGeneration) {
                return;
            }
            waQrLogger.warn("WhatsApp QR disconnected", { reason: reason || "unknown" });
            void recordWhatsAppAlert({
                eventCode: "whatsapp_disconnected",
                component: "wa:qr",
                message: "Sesi WhatsApp terputus dan sedang dijadwalkan tersambung ulang.",
                severity: "error",
                workspaceSlug: currentActiveClientSlug(),
                dedupeKey: "session",
                metadata: { reason: reason || "unknown" },
            });

            void recoverWhatsAppQrBridge(
                "whatsapp_disconnected",
                new Error(reason || "WhatsApp disconnected")
            );
        });

        client.on("message", async (message: any) => {
            await handleIncomingMessageEvent("message", generation, message);
        });

        client.on("message_create", async (message: any) => {
            await handleIncomingMessageEvent("message_create", generation, message);
        });

        startWhatsAppHealthCheck(generation, client);
        await client.initialize();

        if (generation !== sessionGeneration) {
            if (clientRef === client) {
                clientRef = null;
            }
            await destroyWhatsAppClientCompletely(client, "stale_generation");
        }
    } catch (error) {
        if (generation !== sessionGeneration) {
            return;
        }
        if (clientRef === startingClient) {
            clientRef = null;
        }
        stopMissedMessageRecovery();
        stopWhatsAppHealthCheck();
        clearActiveWhatsAppNumber();
        if (startingClient) {
            await destroyWhatsAppClientCompletely(startingClient, "start_failure");
        } else {
            await cleanupStaleWhatsAppBrowsers("start_failure");
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        const chromeMissing = /Could not find Chrome|executable file not found|Browser was not found/i.test(
            message
        );
        const uiMessage = chromeMissing
            ? "Chrome belum ditemukan untuk WhatsApp session. Install browser dengan `pnpm dlx puppeteer browsers install chrome` atau set WA_WEBJS_EXECUTABLE_PATH ke lokasi Chrome."
            : message;
        logWaQrError("Failed to start WhatsApp QR bridge", {
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
        if (!chromeMissing && reconnectEnabled) {
            scheduleBridgeRestart(5_000);
        }
    } finally {
        isStarting = false;
    }
}
