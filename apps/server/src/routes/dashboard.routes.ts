import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as dashboardService from "../services/dashboard.service";

const router: ReturnType<typeof Router> = Router();

function normalizeDateValue(value: unknown) {
    const raw = Array.isArray(value) ? value[0] : value;
    const dateValue = String(raw || "").trim();

    if (!dateValue) {
        return undefined;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : undefined;
}

router.get("/home-analytics", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const dateFrom = normalizeDateValue(req.query.dateFrom);
        const dateTo = normalizeDateValue(req.query.dateTo);
        const analytics = await dashboardService.getHomeAnalytics(user.id, user.role, scope, {
            dateFrom,
            dateTo,
        });
        res.json(analytics);
    } catch (error) {
        next(error);
    }
});

export default router;
