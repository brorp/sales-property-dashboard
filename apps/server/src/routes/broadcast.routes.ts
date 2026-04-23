import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as broadcastService from "../services/broadcast.service";
import { resolveClientIdFromWorkspace } from "../utils/request-client";

const router: ReturnType<typeof Router> = Router();

router.get("/status", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.query.clientId);

        res.json(broadcastService.getBroadcastStatus(clientId));
    } catch (error) {
        next(error);
    }
});

router.post("/estimate", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const {
            salesStatuses,
            appointmentTag,
            dateFrom,
            dateTo,
            clientId,
        } = req.body ?? {};

        const targetClientId = resolveClientIdFromWorkspace(requestUser, clientId);

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
        const requestUser = req as unknown as AuthenticatedRequest;
        const { user } = requestUser;
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

        const targetClientId = resolveClientIdFromWorkspace(requestUser, clientId);

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
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.body?.clientId);

        const result = broadcastService.stopBroadcast(clientId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
