import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as activityLogsService from "../services/activity-logs.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const limitParam =
            typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
        const logs = await activityLogsService.getUnifiedActivityLogs(
            user.id,
            user.role,
            scope,
            limitParam
        );
        res.json(logs);
    } catch (error) {
        next(error);
    }
});

export default router;
