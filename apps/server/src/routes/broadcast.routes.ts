import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as broadcastService from "../services/broadcast.service";

const router: ReturnType<typeof Router> = Router();

router.get("/status", requireAdmin as any, async (_req, res: Response, next: NextFunction) => {
    try {
        res.json(broadcastService.getBroadcastStatus());
    } catch (error) {
        next(error);
    }
});

router.post("/start", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            salesStatuses,
            appointmentTag,
            dateFrom,
            dateTo,
            message,
            mediaDataUrl,
            intervalMinutes,
        } = req.body ?? {};

        const result = await broadcastService.startBroadcast(
            {
                salesStatuses: Array.isArray(salesStatuses) ? salesStatuses : [],
                appointmentTag,
                dateFrom,
                dateTo,
                message,
                mediaDataUrl,
                intervalMinutes,
            },
            user.id
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

router.post("/stop", requireAdmin as any, async (_req, res: Response, next: NextFunction) => {
    try {
        const result = broadcastService.stopBroadcast();
        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
