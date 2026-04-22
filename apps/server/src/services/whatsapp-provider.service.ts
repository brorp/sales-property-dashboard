import { normalizePhone } from "../utils/phone";
import { createComponentLogger } from "../utils/logger";
import { sendWhatsAppQrMedia, sendWhatsAppQrText } from "./whatsapp-qr.service";

const waProviderLogger = createComponentLogger("wa:provider");

type SendResult = {
    sent: boolean;
    provider: "dummy" | "cloud_api" | "qr_local";
    providerMessageId?: string;
    error?: string;
};

let outboundSendChain: Promise<void> = Promise.resolve();
let lastOutboundSentAt = 0;

function toWhatsAppRecipient(input: string) {
    const normalized = normalizePhone(input);
    return normalized.replace(/[^\d]/g, "");
}

function previewBody(body: string) {
    const trimmed = String(body || "").trim();
    if (!trimmed) {
        return "";
    }

    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

function getOutboundThrottleConfig(provider: string) {
    if (provider === "dummy") {
        return {
            minDelayMs: 0,
            jitterMs: 0,
        };
    }

    return {
        minDelayMs: parsePositiveIntEnv(process.env.WA_OUTBOUND_MIN_DELAY_MS, 8_000),
        jitterMs: parsePositiveIntEnv(process.env.WA_OUTBOUND_RANDOM_JITTER_MS, 4_000),
    };
}

async function runWithOutboundThrottle<T>(
    provider: string,
    meta: { to: string; kind: "text" | "media" },
    task: () => Promise<T>
) {
    const { minDelayMs, jitterMs } = getOutboundThrottleConfig(provider);

    if (minDelayMs <= 0 && jitterMs <= 0) {
        return task();
    }

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const previous = outboundSendChain;
    outboundSendChain = previous.finally(() => gate);

    await previous;

    try {
        const now = Date.now();
        const earliestNextSendAt = lastOutboundSentAt + minDelayMs;
        const baseWaitMs = Math.max(0, earliestNextSendAt - now);
        const jitterWaitMs = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
        const totalWaitMs = baseWaitMs + jitterWaitMs;

        if (totalWaitMs > 0) {
            waProviderLogger.info("Applying WhatsApp outbound throttle", {
                provider,
                to: meta.to,
                kind: meta.kind,
                waitMs: totalWaitMs,
                minDelayMs,
                jitterMs,
            });
            await sleep(totalWaitMs);
        }

        const result = await task();
        lastOutboundSentAt = Date.now();
        return result;
    } finally {
        release();
    }
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
    const provider = (process.env.WA_PROVIDER || "dummy").toLowerCase();

    if (provider === "qr_local") {
        return runWithOutboundThrottle(provider, { to, kind: "text" }, () =>
            sendWhatsAppQrText(to, body)
        );
    }

    if (provider !== "cloud_api") {
        waProviderLogger.info("Dummy WhatsApp text send simulated", {
            to,
            bodyPreview: previewBody(body),
        });
        return { sent: true, provider: "dummy" };
    }

    const token = process.env.WA_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WA_CLOUD_PHONE_NUMBER_ID;
    const version = process.env.WA_CLOUD_API_VERSION || "v21.0";

    if (!token || !phoneNumberId) {
        return {
            sent: false,
            provider: "cloud_api",
            error: "Missing WA_CLOUD_API_TOKEN or WA_CLOUD_PHONE_NUMBER_ID",
        };
    }

    const recipient = toWhatsAppRecipient(to);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    try {
        const response = await runWithOutboundThrottle(
            provider,
            { to, kind: "text" },
            () =>
                fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        recipient_type: "individual",
                        to: recipient,
                        type: "text",
                        text: {
                            preview_url: false,
                            body,
                        },
                    }),
                })
        );

        const data = (await response.json()) as any;
        if (!response.ok) {
            return {
                sent: false,
                provider: "cloud_api",
                error: data?.error?.message || `HTTP ${response.status}`,
            };
        }

        return {
            sent: true,
            provider: "cloud_api",
            providerMessageId: data?.messages?.[0]?.id,
        };
    } catch (error) {
        return {
            sent: false,
            provider: "cloud_api",
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

export async function sendWhatsAppMedia(params: {
    to: string;
    body?: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName?: string;
}): Promise<SendResult> {
    const provider = (process.env.WA_PROVIDER || "dummy").toLowerCase();

    if (provider === "qr_local") {
        return runWithOutboundThrottle(provider, { to: params.to, kind: "media" }, () =>
            sendWhatsAppQrMedia(params)
        );
    }

    if (provider !== "cloud_api") {
        waProviderLogger.info("Dummy WhatsApp media send simulated", {
            to: params.to,
            mimeType: params.mimeType,
            fileName: params.fileName || null,
            bodyPreview: previewBody(params.body || ""),
        });
        return { sent: true, provider: "dummy" };
    }

    return {
        sent: false,
        provider: "cloud_api",
        error: "Cloud API media broadcast is not supported in this build",
    };
}
