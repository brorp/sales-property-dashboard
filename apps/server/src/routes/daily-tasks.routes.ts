import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import * as dailyTaskService from "../services/daily-task.service";
import { getWorkspaceClientId } from "../utils/request-client";
import { sendToUser } from "../services/push-notification.service";
import { db } from "../db/index";
import { lead as leadTable, user as userTable } from "../db/schema";
import { eq } from "drizzle-orm";

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

async function notifySuperviorOfSubmit(salesId: string, leadId: string, label: string) {
    const [[salesRow], [leadRow]] = await Promise.all([
        db.select({ supervisorId: userTable.supervisorId, name: userTable.name }).from(userTable).where(eq(userTable.id, salesId)),
        db.select({ name: leadTable.name }).from(leadTable).where(eq(leadTable.id, leadId)),
    ]);
    if (salesRow?.supervisorId) {
        void sendToUser(salesRow.supervisorId, {
            title: "Tugas Diajukan Sales",
            body: `${salesRow.name || "Sales"} mengajukan ${label} untuk lead ${leadRow?.name || ""}.`,
            data: { leadId, type: "submitted_task" },
        });
    }
}

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
            if (updated?.leadId) void notifySuperviorOfSubmit(user.id, updated.leadId, "New Lead");
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
            if (updated?.leadId) void notifySuperviorOfSubmit(user.id, updated.leadId, "Follow Up");
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
