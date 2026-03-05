import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as activityLogsService from "../services/activity-logs.service";
import { logger } from "../utils/logger";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireAdmin as any, async (req, res: Response) => {
    try {
        const limitParam =
            typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
        const logs = await activityLogsService.getUnifiedActivityLogs(limitParam);
        res.json(logs);
    } catch (error) {
        logger.error("GET /activity-logs error", { error, route: "GET /activity-logs" });
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
