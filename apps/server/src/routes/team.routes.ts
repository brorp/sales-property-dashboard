import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
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

export default router;
