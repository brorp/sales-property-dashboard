import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import leadsRoutes from "./leads.routes";
import dashboardRoutes from "./dashboard.routes";
import teamRoutes from "./team.routes";
import profileRoutes from "./profile.routes";
import salesRoutes from "./sales.routes";
import distributionRoutes from "./distribution.routes";
import appointmentsRoutes from "./appointments.routes";
import activityLogsRoutes from "./activity-logs.routes";
import broadcastRoutes from "./broadcast.routes";
import settingsRoutes from "./settings.routes";

const router: ReturnType<typeof Router> = Router();

// All API routes require authentication
router.use(requireAuth as any);

router.use("/leads", leadsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/team", teamRoutes);
router.use("/sales", salesRoutes);
router.use("/profile", profileRoutes);
router.use("/distribution", distributionRoutes);
router.use("/appointments", appointmentsRoutes);
router.use("/activity-logs", activityLogsRoutes);
router.use("/broadcast", broadcastRoutes);
router.use("/settings", settingsRoutes);

export default router;
