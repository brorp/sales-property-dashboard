import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import {
    getLeadDistributionState,
    processExpiredAttempts,
    startDistributionForHeldLead,
    stopAllActiveDistributions,
} from "../services/distribution.service";

const router: ReturnType<typeof Router> = Router();

router.get("/leads/:leadId", async (req, res: Response) => {
    try {
        const state = await getLeadDistributionState(req.params.leadId);
        res.json(state);
    } catch (error) {
        console.error("GET /distribution/leads/:leadId error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/run-timeouts", async (_req, res: Response) => {
    try {
        const processed = await processExpiredAttempts();
        res.json({ processed });
    } catch (error) {
        console.error("POST /distribution/run-timeouts error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/stop-all", requireAdmin as any, async (_req, res: Response) => {
    try {
        const result = await stopAllActiveDistributions();
        res.json(result);
    } catch (error) {
        console.error("POST /distribution/stop-all error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/leads/:leadId/start", requireAdmin as any, async (req, res: Response) => {
    try {
        const result = await startDistributionForHeldLead(req.params.leadId);
        res.json(result);
    } catch (error) {
        if (error instanceof Error) {
            const knownCodes = new Set([
                "LEAD_NOT_FOUND",
                "LEAD_ALREADY_ASSIGNED",
                "LEAD_NOT_STARTABLE",
            ]);
            if (knownCodes.has(error.message)) {
                res.status(400).json({ error: error.message });
                return;
            }
        }

        console.error("POST /distribution/leads/:leadId/start error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
