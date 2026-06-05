import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole, requireRole } from "../middleware/rbac";
import * as adminPasswordService from "../services/admin-password.service";
import * as teamService from "../services/team.service";

const router: ReturnType<typeof Router> = Router();

// supervisor, client_admin, root_admin can see team
router.get("/", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const team = await teamService.getTeamHierarchy(scope);
        res.json(team);
    } catch (error) {
        next(error);
    }
});

router.get("/groups", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const groups = await teamService.listTeamGroups(scope);
        res.json(groups);
    } catch (error) {
        next(error);
    }
});

router.post("/groups", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope, user } = req as unknown as AuthenticatedRequest;
        const created = await teamService.createTeamGroup({
            name: req.body?.name,
            actorId: user.id,
            scope,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.delete("/groups/:groupId", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const deleted = await teamService.deleteTeamGroup({
            groupId: req.params.groupId,
            scope,
        });
        res.json(deleted);
    } catch (error) {
        next(error);
    }
});

router.post("/groups/:groupId/members", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const { userId } = req.body ?? {};
        if (!userId || typeof userId !== "string") {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "userId wajib diisi" });
            return;
        }
        const created = await teamService.addTeamGroupMember({
            groupId: req.params.groupId,
            userId,
            scope,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.delete("/groups/:groupId/members/:memberId", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const deleted = await teamService.removeTeamGroupMember({
            groupId: req.params.groupId,
            memberId: req.params.memberId,
            scope,
        });
        res.json(deleted);
    } catch (error) {
        next(error);
    }
});

router.post("/sales/:id/reset-penalties", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope, user } = req as unknown as AuthenticatedRequest;
        const updated = await teamService.resetSalesPenalties({
            salesId: req.params.id,
            actorId: user.id,
            scope,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.post("/sales/:id/reset-sp", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope, user } = req as unknown as AuthenticatedRequest;
        const updated = await teamService.resetSalesSpLevel({
            salesId: req.params.id,
            actorId: user.id,
            scope,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope } = req as unknown as AuthenticatedRequest;
        const detail = await teamService.getTeamMemberDetail(req.params.id, scope);

        if (!detail) {
            res.status(404).json({
                error: "NOT_FOUND",
                message: "Member tim tidak ditemukan",
            });
            return;
        }

        res.json(detail);
    } catch (error) {
        next(error);
    }
});

router.delete("/sales/:id", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope, user } = req as unknown as AuthenticatedRequest;
        await adminPasswordService.assertAdminPasswordConfirmation({
            actorUserId: user.id,
            actorRole: user.role,
            password: req.body?.passwordConfirmation,
        });
        const deleted = await teamService.deleteInactiveSalesMember({
            salesId: req.params.id,
            actorId: user.id,
            scope,
        });

        res.json(deleted);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { scope, user } = req as unknown as AuthenticatedRequest;
        await adminPasswordService.assertAdminPasswordConfirmation({
            actorUserId: user.id,
            actorRole: user.role,
            password: req.body?.passwordConfirmation,
        });
        const updated = await teamService.deactivateSupervisorMember({
            supervisorId: req.params.id,
            actorId: user.id,
            scope,
        });

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
