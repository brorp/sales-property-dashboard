import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as dashboardService from "../services/dashboard.service";

const router: ReturnType<typeof Router> = Router();

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function normalizeDateValue(value: unknown) {
    const raw = Array.isArray(value) ? value[0] : value;
    const dateValue = String(raw || "").trim();

    if (!dateValue) {
        return undefined;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : undefined;
}

function getDefaultLast30DayRange() {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 29);

    return {
        dateFrom: formatDateInput(start),
        dateTo: formatDateInput(today),
    };
}

router.get("/home-analytics", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        let dateFrom = normalizeDateValue(req.query.dateFrom);
        let dateTo = normalizeDateValue(req.query.dateTo);

        if (!dateFrom && !dateTo) {
            const fallbackRange = getDefaultLast30DayRange();
            dateFrom = fallbackRange.dateFrom;
            dateTo = fallbackRange.dateTo;
        }

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
