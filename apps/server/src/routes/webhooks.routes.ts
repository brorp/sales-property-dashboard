import { Router } from "express";
import type { Response } from "express";
import { ingestMetaLead } from "../services/meta.service";
import { ingestIncomingMessage } from "../services/whatsapp.service";
import { processExpiredAttempts } from "../services/distribution.service";

const router: ReturnType<typeof Router> = Router();

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
        const { metaLeadId, name, phone, sourceAds } = req.body ?? {};
        if (!name || !phone) {
            res.status(400).json({ error: "name and phone are required" });
            return;
        }

        const result = await ingestMetaLead({
            metaLeadId,
            name,
            phone,
            sourceAds,
        });

        res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
        console.error("POST /webhooks/meta/leads error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/messages", async (req, res: Response) => {
    try {
        const { fromWa, toWa, body, providerMessageId, sourceAds, clientName, metaLeadId } =
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
        });

        res.json(result);
    } catch (error) {
        console.error("POST /webhooks/whatsapp/messages error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/dummy/client-message", async (req, res: Response) => {
    try {
        const { clientWa, body, clientName, sourceAds, metaLeadId } = req.body ?? {};
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
        });

        res.json(result);
    } catch (error) {
        console.error("POST /webhooks/whatsapp/dummy/client-message error:", error);
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
        console.error("POST /webhooks/whatsapp/dummy/sales-ack error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/whatsapp/dummy/run-timeouts", async (_req, res: Response) => {
    try {
        const processed = await processExpiredAttempts();
        res.json({ processed });
    } catch (error) {
        console.error("POST /webhooks/whatsapp/dummy/run-timeouts error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
