import { Router } from "express";
import type { Response, NextFunction } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as activityLogsService from "../services/activity-logs.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const limitParam =
            typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
        const logs = await activityLogsService.getUnifiedActivityLogs(limitParam);
        res.json(logs);
    } catch (error) {
        next(error);
    }
});

export default router;
