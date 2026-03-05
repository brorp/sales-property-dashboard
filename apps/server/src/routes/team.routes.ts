import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as teamService from "../services/team.service";
import { logger } from "../utils/logger";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireAdmin as any, async (_req, res: Response) => {
    try {
        const team = await teamService.getTeamWithStats();
        res.json(team);
    } catch (err) {
        logger.error("GET /team error", { error: err, route: "GET /team" });
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
