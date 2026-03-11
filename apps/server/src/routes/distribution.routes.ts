import { Router } from "express";
import type { Response, NextFunction } from "express";
import { requireAdmin } from "../middleware/rbac";
import {
    getLeadDistributionState,
    processExpiredAttempts,
    startDistributionForHeldLead,
    stopAllActiveDistributions,
} from "../services/distribution.service";

const router: ReturnType<typeof Router> = Router();

router.get("/leads/:leadId", async (req, res: Response, next: NextFunction) => {
    try {
        const state = await getLeadDistributionState(req.params.leadId);
        res.json(state);
    } catch (error) {
        next(error);
    }
});

router.post("/run-timeouts", async (_req, res: Response, next: NextFunction) => {
    try {
        const processed = await processExpiredAttempts();
        res.json({ processed });
    } catch (error) {
        next(error);
    }
});

router.post("/stop-all", requireAdmin as any, async (_req, res: Response, next: NextFunction) => {
    try {
        const result = await stopAllActiveDistributions();
        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.post("/leads/:leadId/start", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const result = await startDistributionForHeldLead(req.params.leadId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
