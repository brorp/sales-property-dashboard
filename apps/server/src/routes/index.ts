import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import leadsRoutes from "./leads.routes";
import dashboardRoutes from "./dashboard.routes";
import teamRoutes from "./team.routes";
import profileRoutes from "./profile.routes";
import salesRoutes from "./sales.routes";
import distributionRoutes from "./distribution.routes";

const router = Router();

// All API routes require authentication
router.use(requireAuth as any);

router.use("/leads", leadsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/team", teamRoutes);
router.use("/sales", salesRoutes);
router.use("/profile", profileRoutes);
router.use("/distribution", distributionRoutes);

export default router;
