import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as dashboardService from "../services/dashboard.service";

const router: ReturnType<typeof Router> = Router();

router.get("/home-analytics", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const analytics = await dashboardService.getHomeAnalytics(user.id, user.role);
        res.json(analytics);
    } catch (err) {
        console.error("GET /dashboard/home-analytics error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
