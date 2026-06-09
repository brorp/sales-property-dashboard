import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
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

router.get("/immune", requireRole("client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const rows = await dailyTaskPenaltyService.listPenaltyImmunities({ scope });
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/immune", requireRole("client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const updated = await dailyTaskPenaltyService.addPenaltyImmunity({
            salesId: String(req.body?.salesId || "").trim(),
            grantedById: user.id,
            scope,
        });
        res.status(201).json(updated);
    } catch (error) {
        next(error);
    }
});

router.delete("/immune/:salesId", requireRole("client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const updated = await dailyTaskPenaltyService.removePenaltyImmunity({
            salesId: String(req.params.salesId || "").trim(),
            revokedById: user.id,
            scope,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/compensate", requireRole("client_admin", "root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const updated = await dailyTaskPenaltyService.compensatePenalty({
            penaltyId: req.params.id,
            compensatedById: user.id,
            reason: String(req.body?.reason || "").trim(),
            scope,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
