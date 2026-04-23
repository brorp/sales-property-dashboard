import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import {
    getSystemSettings,
    updateSystemSettings,
} from "../services/system-settings.service";
import { resolveClientIdFromWorkspace } from "../utils/request-client";

const router: ReturnType<typeof Router> = Router();

router.get("/system", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.query.clientId);

        const settings = await getSystemSettings(clientId);
        res.json(settings);
    } catch (error) {
        next(error);
    }
});

router.patch("/system", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const {
            distributionAckTimeoutMinutes,
            operationalStart,
            operationalEnd,
            operationalTimezone,
            outsideOfficeReply,
            insideOfficeReply,
            clientId,
        } = req.body ?? {};

        const targetClientId = resolveClientIdFromWorkspace(requestUser, clientId);

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
            insideOfficeReply:
                typeof insideOfficeReply === "string"
                    ? insideOfficeReply
                    : undefined,
        }, targetClientId);

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
