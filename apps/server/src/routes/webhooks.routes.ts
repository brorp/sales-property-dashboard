import { Router } from "express";
import type { Response } from "express";
import { ingestMetaLead } from "../services/meta.service";
import { ingestIncomingMessage } from "../services/whatsapp.service";
import { processExpiredAttempts } from "../services/distribution.service";
import { sendWhatsAppText } from "../services/whatsapp-provider.service";
import { logger } from "../utils/logger";

const router: ReturnType<typeof Router> = Router();

function parseCloudApiPayload(payload: any, fallbackClientId?: string | null) {
    const events: Array<{
        fromWa: string;
        toWa?: string;
        body: string;
        providerMessageId?: string;
        clientName?: string;
        clientId?: string | null;
    }> = [];

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            if (change?.field !== "messages") {
                continue;
            }

            const value = change?.value || {};
            const toWa =
                value?.metadata?.display_phone_number ||
                value?.metadata?.phone_number_id;
            const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
            const messages = Array.isArray(value?.messages) ? value.messages : [];

            for (const message of messages) {
                const fromWa = message?.from;
                if (!fromWa) continue;

                const textBody =
                    message?.text?.body ||
                    message?.button?.text ||
                    message?.interactive?.button_reply?.title ||
                    message?.interactive?.list_reply?.title ||
                    "";

                if (!textBody) continue;

                const contact = contacts.find((c: any) => c?.wa_id === fromWa);
                events.push({
                    fromWa,
                    toWa,
                    body: textBody,
                    providerMessageId: message?.id,
                    clientName: contact?.profile?.name,
                    clientId: fallbackClientId || null,
                });
            }
        }
    }

    return events;
}

router.get("/whatsapp", (req, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "dev-verify-token";

    if (mode === "subscribe" && token === verifyToken) {
        res.status(200).send(String(challenge || "ok"));
        return;
    }

    res.status(403).json({ error: "Verification failed" });
});

router.post("/meta/leads", async (req, res: Response) => {
    try {
        const { metaLeadId, name, phone, sourceAds, clientId } = req.body ?? {};
        if (!name || !phone) {
            res.status(400).json({ error: "name and phone are required" });
            return;
        }

        const result = await ingestMetaLead({
            metaLeadId,
            name,
            phone,
            sourceAds,
            clientId: typeof clientId === "string" ? clientId : null,
        });

        res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
        logger.error("POST /webhooks/meta/leads error", { error, route: "POST /webhooks/meta/leads" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/messages", async (req, res: Response) => {
    try {
        const fallbackClientId =
            typeof req.body?.clientId === "string" ? req.body.clientId : null;
        const cloudEvents = parseCloudApiPayload(req.body, fallbackClientId);
        if (cloudEvents.length > 0) {
            const results = [];
            for (const event of cloudEvents) {
                const result = await ingestIncomingMessage(event);
                if (
                    result.type === "client_message" &&
                    result.firstClientMessage &&
                    result.autoReplyText
                ) {
                    await sendWhatsAppText(event.fromWa, result.autoReplyText);
                }
                results.push(result);
            }
            res.json({ received: true, count: results.length, results });
            return;
        }

        const { fromWa, toWa, body, providerMessageId, sourceAds, clientName, metaLeadId, clientId } =
            req.body ?? {};
        if (!fromWa || !body) {
            res.status(400).json({ error: "fromWa and body are required" });
            return;
        }

        const result = await ingestIncomingMessage({
            fromWa,
            toWa,
            body,
            providerMessageId,
            sourceAds,
            clientName,
            metaLeadId,
            clientId: typeof clientId === "string" ? clientId : null,
        });

        if (
            result.type === "client_message" &&
            result.firstClientMessage &&
            result.autoReplyText
        ) {
            await sendWhatsAppText(fromWa, result.autoReplyText);
        }

        res.json(result);
    } catch (error) {
        logger.error("POST /webhooks/whatsapp/messages error", { error, route: "POST /webhooks/whatsapp/messages" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/dummy/client-message", async (req, res: Response) => {
    try {
        const { clientWa, body, clientName, sourceAds, metaLeadId, clientId } = req.body ?? {};
        if (!clientWa || !body) {
            res.status(400).json({ error: "clientWa and body are required" });
            return;
        }

        const result = await ingestIncomingMessage({
            fromWa: clientWa,
            toWa: process.env.PROPERTY_LOUNGE_WA || "+620000000000",
            body,
            clientName,
            sourceAds,
            metaLeadId,
            clientId: typeof clientId === "string" ? clientId : null,
        });

        if (
            result.type === "client_message" &&
            result.firstClientMessage &&
            result.autoReplyText
        ) {
            await sendWhatsAppText(clientWa, result.autoReplyText);
        }

        res.json(result);
    } catch (error) {
        logger.error("POST /webhooks/whatsapp/dummy/client-message error", { error, route: "POST /webhooks/whatsapp/dummy/client-message" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/dummy/sales-ack", async (req, res: Response) => {
    try {
        const { salesWa, body } = req.body ?? {};
        if (!salesWa || !body) {
            res.status(400).json({ error: "salesWa and body are required" });
            return;
        }

        const result = await ingestIncomingMessage({
            fromWa: salesWa,
            toWa: process.env.PROPERTY_LOUNGE_WA || "+620000000000",
            body,
        });

        res.json(result);
    } catch (error) {
        logger.error("POST /webhooks/whatsapp/dummy/sales-ack error", { error, route: "POST /webhooks/whatsapp/dummy/sales-ack" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/dummy/run-timeouts", async (_req, res: Response) => {
    try {
        const processed = await processExpiredAttempts();
        res.json({ processed });
    } catch (error) {
        logger.error("POST /webhooks/whatsapp/dummy/run-timeouts error", { error, route: "POST /webhooks/whatsapp/dummy/run-timeouts" });
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
