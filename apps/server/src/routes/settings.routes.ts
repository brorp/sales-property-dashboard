import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import {
    getSystemSettings,
    updateSystemSettings,
} from "../services/system-settings.service";

const router: ReturnType<typeof Router> = Router();

router.get("/system", requireAdmin as any, async (_req, res: Response) => {
    try {
        const settings = await getSystemSettings();
        res.json(settings);
    } catch (error) {
        console.error("GET /settings/system error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/system", requireAdmin as any, async (req, res: Response) => {
    try {
        const {
            distributionAckTimeoutMinutes,
            operationalStart,
            operationalEnd,
            operationalTimezone,
            outsideOfficeReply,
        } = req.body ?? {};

        const updated = await updateSystemSettings({
            distributionAckTimeoutMinutes:
                typeof distributionAckTimeoutMinutes === "number"
                    ? distributionAckTimeoutMinutes
                    : undefined,
            operationalStart:
                typeof operationalStart === "string" ? operationalStart : undefined,
            operationalEnd:
                typeof operationalEnd === "string" ? operationalEnd : undefined,
            operationalTimezone:
                typeof operationalTimezone === "string"
                    ? operationalTimezone
                    : undefined,
            outsideOfficeReply:
                typeof outsideOfficeReply === "string"
                    ? outsideOfficeReply
                    : undefined,
        });

        res.json(updated);
    } catch (error) {
        if (error instanceof Error) {
            const knownBadRequestCodes = new Set([
                "INVALID_DISTRIBUTION_ACK_TIMEOUT",
                "INVALID_OPERATIONAL_TIMEZONE",
                "INVALID_OPERATIONAL_TIME",
                "INVALID_OPERATIONAL_TIME_RANGE",
                "OUTSIDE_OFFICE_REPLY_REQUIRED",
            ]);

            if (knownBadRequestCodes.has(error.message)) {
                res.status(400).json({ error: error.message });
                return;
            }
        }

        console.error("PATCH /settings/system error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
