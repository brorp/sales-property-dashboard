import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole, requireRole } from "../middleware/rbac";
import * as dailyTaskPenaltyService from "../services/daily-task-penalty.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireRole("sales", "supervisor", "client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const rows = await dailyTaskPenaltyService.getPenalties({
            role: user.role,
            requesterId: user.id,
            scope,
            salesId:
                typeof req.query.salesId === "string" && req.query.salesId.trim()
                    ? req.query.salesId
                    : null,
        });
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/compensate", requireRole("client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const updated = await dailyTaskPenaltyService.compensatePenalty({
            penaltyId: req.params.id,
            compensatedById: user.id,
            reason: String(req.body?.reason || "").trim(),
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
