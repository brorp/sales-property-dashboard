import { Router } from "express";
import type { Response, NextFunction } from "express";
import { requireAdmin } from "../middleware/rbac";
import {
    getSystemSettings,
    updateSystemSettings,
} from "../services/system-settings.service";

const router: ReturnType<typeof Router> = Router();

router.get("/system", requireAdmin as any, async (_req, res: Response, next: NextFunction) => {
    try {
        const settings = await getSystemSettings();
        res.json(settings);
    } catch (error) {
        next(error);
    }
});

router.patch("/system", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
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
        next(error);
    }
});

export default router;
