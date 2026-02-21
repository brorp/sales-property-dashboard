import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as teamService from "../services/team.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", requireAdmin as any, async (_req, res: Response) => {
    try {
        const team = await teamService.getTeamWithStats();
        res.json(team);
    } catch (err) {
        console.error("GET /team error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
