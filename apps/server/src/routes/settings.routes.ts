import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import {
    getSystemSettings,
    updateSystemSettings,
} from "../services/system-settings.service";

const router: ReturnType<typeof Router> = Router();

router.get("/system", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const clientId =
            user.role === "root_admin"
                ? typeof req.query.clientId === "string"
                    ? req.query.clientId
                    : null
                : user.clientId || null;

        const settings = await getSystemSettings(clientId);
        res.json(settings);
    } catch (error) {
        next(error);
    }
});

router.patch("/system", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            distributionAckTimeoutMinutes,
            operationalStart,
            operationalEnd,
            operationalTimezone,
            outsideOfficeReply,
            clientId,
        } = req.body ?? {};

        const targetClientId =
            user.role === "root_admin"
                ? typeof clientId === "string" && clientId.trim()
                    ? clientId
                    : null
                : user.clientId || null;

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
        }, targetClientId);

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
