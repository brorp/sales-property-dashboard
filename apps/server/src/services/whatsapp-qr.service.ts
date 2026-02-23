import { rm } from "node:fs/promises";
import { ingestIncomingMessage } from "./whatsapp.service";
import { normalizePhone } from "../utils/phone";

type QrSocket = {
    sendMessage: (jid: string, payload: { text: string }) => Promise<any>;
    ev: {
        on: (event: string, handler: (...args: any[]) => void) => void;
    };
    end?: (error?: Error) => void;
    ws?: {
        close?: () => void;
    };
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

let socketRef: QrSocket | null = null;
let isStarting = false;
let reconnectEnabled = true;
let sessionGeneration = 0;

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

function currentProvider() {
    return (process.env.WA_PROVIDER || "dummy").toLowerCase();
}

function currentAuthPath() {
    return process.env.WA_QR_AUTH_PATH || ".wa-qr-auth";
}

function updateRuntimeState(
    patch: Partial<Omit<WhatsAppQrAdminState, "provider" | "enabled" | "authPath">>
) {
    Object.assign(runtimeState, patch, { updatedAt: new Date().toISOString() });
}

function phoneToJid(phone: string) {
    const normalized = normalizePhone(phone);
    const digits = normalized.replace(/[^\d]/g, "");
    return `${digits}@s.whatsapp.net`;
}

function jidToPhone(jid: string | null | undefined) {
    if (!jid || !jid.endsWith("@s.whatsapp.net")) {
        return null;
    }
    const raw = jid.split("@")[0];
    if (!raw || raw.includes(":")) {
        return null;
    }
    return normalizePhone(raw);
}

function extractTextMessage(message: any): string | null {
    const candidate =
        message?.conversation ||
        message?.extendedTextMessage?.text ||
        message?.imageMessage?.caption ||
        message?.videoMessage?.caption ||
        message?.buttonsResponseMessage?.selectedDisplayText ||
        message?.listResponseMessage?.title ||
        message?.templateButtonReplyMessage?.selectedDisplayText ||
        message?.ephemeralMessage?.message?.conversation ||
        message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
        message?.viewOnceMessage?.message?.conversation ||
        message?.viewOnceMessage?.message?.extendedTextMessage?.text;

    if (!candidate || typeof candidate !== "string") {
        return null;
    }
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toDigitsOnly(input: string) {
    return input.replace(/[^\d]/g, "");
}

function qrToImageUrl(qr: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`;
}

async function handleIncomingMessage(message: any) {
    if (!message?.key || message.key.fromMe) {
        return;
    }

    const fromWa = jidToPhone(message.key.remoteJid);
    if (!fromWa) {
        return;
    }

    const body = extractTextMessage(message.message);
    if (!body) {
        return;
    }

    const result = await ingestIncomingMessage({
        fromWa,
        body,
        providerMessageId: message.key.id,
        clientName: message.pushName || undefined,
    });

    if (result.type === "client_message" && result.firstClientMessage) {
        await sendWhatsAppQrText(
            fromWa,
            "Harap menunggu agent professional akan menhubungi anda"
        );
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

export async function sendWhatsAppQrText(to: string, body: string) {
    if (currentProvider() !== "qr_local") {
        return {
            sent: false,
            provider: "qr_local" as const,
            error: "WA_PROVIDER is not qr_local",
        };
    }

    if (!socketRef) {
        return {
            sent: false,
            provider: "qr_local" as const,
            error: "QR WhatsApp socket is not connected yet",
        };
    }

    try {
        const jid = phoneToJid(to);
        const response = await socketRef.sendMessage(jid, { text: body });
        return {
            sent: true,
            provider: "qr_local" as const,
            providerMessageId: response?.key?.id,
        };
    } catch (error) {
        return {
            sent: false,
            provider: "qr_local" as const,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

export async function stopWhatsAppQrBridge() {
    reconnectEnabled = false;
    sessionGeneration += 1;

    if (!socketRef) {
        updateRuntimeState({ status: "idle", qr: null, qrImageUrl: null, pairingCode: null });
        return;
    }

    try {
        socketRef.end?.(new Error("manual_stop"));
    } catch {
        // ignore
    }

    try {
        socketRef.ws?.close?.();
    } catch {
        // ignore
    }

    socketRef = null;
    updateRuntimeState({
        status: "disconnected",
        qr: null,
        qrImageUrl: null,
        pairingCode: null,
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
        lastError: null,
        lastDisconnectCode: null,
    });
}

export async function startWhatsAppQrBridge() {
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

    if (socketRef || isStarting) {
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
        lastError: null,
    });

    try {
        let makeWASocket: any;
        let Browsers: any;
        let DisconnectReason: any;
        let useMultiFileAuthState: any;
        let fetchLatestBaileysVersion: any;
        let qrcodeTerminal: any;

        try {
            const baileys = await import("@whiskeysockets/baileys");
            makeWASocket = baileys.default;
            Browsers = baileys.Browsers;
            DisconnectReason = baileys.DisconnectReason;
            useMultiFileAuthState = baileys.useMultiFileAuthState;
            fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
            qrcodeTerminal = (await import("qrcode-terminal")).default;
        } catch (importError) {
            const message =
                "[wa:qr] missing dependencies. Run: pnpm --filter @property-lounge/server add @whiskeysockets/baileys qrcode-terminal";
            console.error(message);
            console.error("[wa:qr] import error:", importError);
            updateRuntimeState({
                status: "error",
                lastError: message,
            });
            return;
        }

        const authPath = currentAuthPath();
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        console.log(`[wa:qr] using auth path: ${authPath}`);
        console.log("[wa:qr] waiting for QR / existing session...");
        updateRuntimeState({
            status: "awaiting_qr",
            pairingPhone: null,
        });

        const versionInfo = fetchLatestBaileysVersion
            ? await fetchLatestBaileysVersion()
            : { version: undefined, isLatest: false };
        if (versionInfo.version) {
            console.log(
                `[wa:qr] WA Web version: ${versionInfo.version.join(".")} (latest=${versionInfo.isLatest})`
            );
        }

        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            ...(versionInfo.version ? { version: versionInfo.version } : {}),
            browser: Browsers.ubuntu("Chrome"),
            syncFullHistory: false,
        });

        socketRef = socket;
        socket.ev.on("creds.update", saveCreds);

        const pairingPhoneRaw = process.env.WA_PAIRING_PHONE || "";
        const pairingPhone = toDigitsOnly(pairingPhoneRaw);
        let qrSeen = false;
        let connected = false;
        let pairingRequested = false;

        if (pairingPhone) {
            setTimeout(async () => {
                if (generation !== sessionGeneration) {
                    return;
                }
                if (qrSeen || connected || pairingRequested || !socketRef) {
                    return;
                }

                pairingRequested = true;
                updateRuntimeState({
                    status: "awaiting_pairing_code",
                    pairingPhone,
                });

                try {
                    const code = await (socket as any).requestPairingCode(pairingPhone);
                    if (code) {
                        console.log(`[wa:qr] pairing code for ${pairingPhone}: ${String(code)}`);
                        console.log(
                            "[wa:qr] open WhatsApp > Linked devices > Link with phone number"
                        );
                        updateRuntimeState({
                            pairingCode: String(code),
                        });
                    }
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Failed requesting pairing code";
                    console.error("[wa:qr] failed requesting pairing code:", error);
                    updateRuntimeState({
                        status: "error",
                        lastError: message,
                    });
                }
            }, 5000);
        }

        socket.ev.on("connection.update", (update: any) => {
            if (generation !== sessionGeneration) {
                return;
            }

            if (update?.qr) {
                qrSeen = true;
                console.log("[wa:qr] scan this QR from WhatsApp linked devices menu:");
                qrcodeTerminal.generate(update.qr, { small: true });
                updateRuntimeState({
                    status: "awaiting_qr",
                    qr: update.qr,
                    qrImageUrl: qrToImageUrl(update.qr),
                    pairingCode: null,
                });
            }

            if (update?.connection === "open") {
                connected = true;
                console.log("[wa:qr] connected");
                updateRuntimeState({
                    status: "connected",
                    qr: null,
                    qrImageUrl: null,
                    pairingCode: null,
                    lastError: null,
                    lastDisconnectCode: null,
                });
            }

            if (update?.connection === "close") {
                const statusCode = Number(update?.lastDisconnect?.error?.output?.statusCode || 0);
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const closeError = update?.lastDisconnect?.error;
                const closeMessage =
                    closeError instanceof Error ? closeError.message : String(closeError || "");

                socketRef = null;
                console.log(`[wa:qr] connection closed (status=${statusCode || "unknown"})`);
                updateRuntimeState({
                    status: "disconnected",
                    lastDisconnectCode: statusCode || null,
                    lastError: closeMessage || null,
                });

                if (isLoggedOut) {
                    console.log(
                        "[wa:qr] session logged out. Re-scan QR by restarting server."
                    );
                    return;
                }

                if (!reconnectEnabled || generation !== sessionGeneration) {
                    return;
                }

                setTimeout(() => {
                    if (reconnectEnabled && generation === sessionGeneration) {
                        void startWhatsAppQrBridge();
                    }
                }, 2000);
            }
        });

        socket.ev.on("messages.upsert", async (event: any) => {
            if (generation !== sessionGeneration) {
                return;
            }

            const messages = Array.isArray(event?.messages) ? event.messages : [];
            for (const message of messages) {
                try {
                    await handleIncomingMessage(message);
                } catch (error) {
                    console.error("[wa:qr] failed handling inbound message:", error);
                }
            }
        });
    } catch (error) {
        socketRef = null;
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[wa:qr] failed to start bridge:", error);
        updateRuntimeState({
            status: "error",
            lastError: message,
        });
    } finally {
        isStarting = false;
    }
}
