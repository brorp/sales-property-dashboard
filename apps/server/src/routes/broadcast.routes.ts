import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as broadcastService from "../services/broadcast.service";

const router: ReturnType<typeof Router> = Router();

router.get("/status", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const clientId =
            user.role === "root_admin"
                ? typeof req.query.clientId === "string"
                    ? req.query.clientId
                    : null
                : user.clientId || null;

        res.json(broadcastService.getBroadcastStatus(clientId));
    } catch (error) {
        next(error);
    }
});

router.post("/estimate", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            salesStatuses,
            appointmentTag,
            dateFrom,
            dateTo,
            clientId,
        } = req.body ?? {};

        const targetClientId =
            user.role === "root_admin"
                ? typeof clientId === "string" && clientId.trim()
                    ? clientId
                    : null
                : user.clientId || null;

        const result = await broadcastService.estimateBroadcast(
            {
                salesStatuses: Array.isArray(salesStatuses) ? salesStatuses : [],
                appointmentTag,
                dateFrom,
                dateTo,
            },
            targetClientId
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.post("/start", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            salesStatuses,
            appointmentTag,
            dateFrom,
            dateTo,
            message,
            mediaDataUrl,
            intervalSeconds,
            intervalMinutes,
            clientId,
        } = req.body ?? {};

        const targetClientId =
            user.role === "root_admin"
                ? typeof clientId === "string" && clientId.trim()
                    ? clientId
                    : null
                : user.clientId || null;

        const result = await broadcastService.startBroadcast(
            {
                salesStatuses: Array.isArray(salesStatuses) ? salesStatuses : [],
                appointmentTag,
                dateFrom,
                dateTo,
                message,
                mediaDataUrl,
                intervalSeconds,
                intervalMinutes,
            },
            user.id,
            targetClientId
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

router.post("/stop", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const clientId =
            user.role === "root_admin"
                ? typeof req.body?.clientId === "string" && req.body.clientId.trim()
                    ? req.body.clientId
                    : null
                : user.clientId || null;

        const result = broadcastService.stopBroadcast(clientId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
