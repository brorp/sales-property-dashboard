import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as broadcastService from "../services/broadcast.service";

const router: ReturnType<typeof Router> = Router();

function mapBroadcastError(error: unknown) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    const badRequestCodes = new Set([
        "BROADCAST_STATUS_EMPTY",
        "BROADCAST_INTERVAL_INVALID",
        "INVALID_MEDIA_DATA_URL",
        "MEDIA_TYPE_NOT_SUPPORTED",
        "MEDIA_EMPTY",
        "BROADCAST_CONTENT_EMPTY",
        "BROADCAST_NO_TARGET",
    ]);

    if (badRequestCodes.has(code)) {
        return {
            status: 400,
            body: { error: code },
        };
    }

    if (code === "BROADCAST_ALREADY_RUNNING") {
        return {
            status: 409,
            body: { error: code },
        };
    }

    return {
        status: 500,
        body: { error: "Internal server error" },
    };
}

router.get("/status", requireAdmin as any, async (_req, res: Response) => {
    try {
        res.json(broadcastService.getBroadcastStatus());
    } catch (error) {
        console.error("GET /broadcast/status error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/start", requireAdmin as any, async (req, res: Response) => {
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
        console.error("POST /broadcast/start error:", error);
        const mapped = mapBroadcastError(error);
        res.status(mapped.status).json(mapped.body);
    }
});

router.post("/stop", requireAdmin as any, async (_req, res: Response) => {
    try {
        const result = broadcastService.stopBroadcast();
        res.json(result);
    } catch (error) {
        console.error("POST /broadcast/stop error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
