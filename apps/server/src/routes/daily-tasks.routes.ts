import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import * as dailyTaskService from "../services/daily-task.service";
import { getWorkspaceClientId } from "../utils/request-client";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireRole("sales") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const { user } = requestUser;
        const data = await dailyTaskService.getDailyTasksForSales(
            user.id,
            getWorkspaceClientId(requestUser)
        );
        res.json(data);
    } catch (error) {
        next(error);
    }
});

router.get("/counts", requireRole("sales") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const { user } = requestUser;
        const counts = await dailyTaskService.getDailyTaskCounts(
            user.id,
            getWorkspaceClientId(requestUser)
        );
        res.json(counts);
    } catch (error) {
        next(error);
    }
});

router.post(
    "/:id/submit-new-lead",
    requireRole("sales") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user } = req as unknown as AuthenticatedRequest;
            const updated = await dailyTaskService.submitNewLeadTask({
                taskId: req.params.id,
                actorId: user.id,
                actorName: user.name,
                screenshotUrl: String(req.body?.screenshotUrl || "").trim(),
                salesStatus: String(req.body?.salesStatus || "").trim(),
            });
            res.json(updated);
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    "/:id/submit-follow-up",
    requireRole("sales") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user } = req as unknown as AuthenticatedRequest;
            const updated = await dailyTaskService.submitFollowUpTask({
                taskId: req.params.id,
                actorId: user.id,
                actorName: user.name,
                screenshotUrl: String(req.body?.screenshotUrl || "").trim(),
            });
            res.json(updated);
        } catch (error) {
            next(error);
        }
    }
);

router.post(
    "/:id/submit-deadline-lead",
    requireRole("sales") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user } = req as unknown as AuthenticatedRequest;
            const action = String(req.body?.action || "").trim();
            if (action !== "change_to_cold" && action !== "stay") {
                res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: "Action Deadline Leads tidak valid",
                });
                return;
            }

            const updated = await dailyTaskService.submitDeadlineLeadTask({
                taskId: req.params.id,
                actorId: user.id,
                actorName: user.name,
                action,
            });
            res.json(updated);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
