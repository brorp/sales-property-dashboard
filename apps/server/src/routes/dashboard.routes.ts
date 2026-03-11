import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as dashboardService from "../services/dashboard.service";

const router: ReturnType<typeof Router> = Router();

router.get("/home-analytics", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const analytics = await dashboardService.getHomeAnalytics(user.id, user.role, scope);
        res.json(analytics);
    } catch (error) {
        next(error);
    }
});

export default router;
