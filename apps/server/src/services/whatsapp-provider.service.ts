import { normalizePhone } from "../utils/phone";
import { sendWhatsAppQrMedia, sendWhatsAppQrText } from "./whatsapp-qr.service";

type SendResult = {
    sent: boolean;
    provider: "dummy" | "cloud_api" | "qr_local";
    providerMessageId?: string;
    error?: string;
};

function toWhatsAppRecipient(input: string) {
    const normalized = normalizePhone(input);
    return normalized.replace(/[^\d]/g, "");
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
    const provider = (process.env.WA_PROVIDER || "dummy").toLowerCase();

    if (provider === "qr_local") {
        return sendWhatsAppQrText(to, body);
    }

    if (provider !== "cloud_api") {
        console.log(`[wa:dummy] -> ${to}: ${body}`);
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
        const response = await fetch(url, {
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
        });

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
        return sendWhatsAppQrMedia(params);
    }

    if (provider !== "cloud_api") {
        console.log(
            `[wa:dummy][media] -> ${params.to}: mime=${params.mimeType} text=${params.body || ""}`
        );
        return { sent: true, provider: "dummy" };
    }

    return {
        sent: false,
        provider: "cloud_api",
        error: "Cloud API media broadcast is not supported in this build",
    };
}
