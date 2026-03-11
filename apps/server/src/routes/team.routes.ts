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
        const team = await teamService.getTeamWithStats(scope);
        res.json(team);
    } catch (error) {
        next(error);
    }
});

export default router;
