import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as dashboardService from "../services/dashboard.service";

const router: ReturnType<typeof Router> = Router();

router.get("/stats", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const stats = await dashboardService.getStats(user.id, user.role);
        res.json(stats);
    } catch (err) {
        console.error("GET /dashboard/stats error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/today-appointments", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const appointments = await dashboardService.getTodayAppointments(
            user.id,
            user.role
        );
        res.json(appointments);
    } catch (err) {
        console.error("GET /dashboard/today-appointments error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/needs-followup", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const leads = await dashboardService.getNeedsFollowup(
            user.id,
            user.role
        );
        res.json(leads);
    } catch (err) {
        console.error("GET /dashboard/needs-followup error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/recent", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const leads = await dashboardService.getRecentLeads(
            user.id,
            user.role
        );
        res.json(leads);
    } catch (err) {
        console.error("GET /dashboard/recent error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get(
    "/sales-performance",
    requireAdmin as any,
    async (_req, res: Response) => {
        try {
            const performance = await dashboardService.getSalesPerformance();
            res.json(performance);
        } catch (err) {
            console.error("GET /dashboard/sales-performance error:", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

export default router;
