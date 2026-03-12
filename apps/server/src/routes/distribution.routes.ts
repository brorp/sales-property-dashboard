import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole, requireRole } from "../middleware/rbac";
import {
    getLeadDistributionState,
    processExpiredAttempts,
    startDistributionForHeldLead,
    stopAllActiveDistributions,
} from "../services/distribution.service";
import * as leadsService from "../services/leads.service";

const router: ReturnType<typeof Router> = Router();

function canAccessLead(
    lead: { clientId?: string | null; assignedTo?: string | null } | null,
    reqUser: { id: string; role: string; clientId?: string | null },
    scope?: { managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin") return true;
    if (reqUser.role === "client_admin") return lead.clientId === (reqUser.clientId || null);
    if (reqUser.role === "supervisor") {
        return Boolean(lead.assignedTo && scope?.managedSalesIds?.includes(lead.assignedTo));
    }
    return lead.assignedTo === reqUser.id;
}

router.get("/leads/:leadId", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const lead = await leadsService.findById(req.params.leadId);
        if (!lead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }
        if (!canAccessLead(lead, user, scope)) {
            res.status(403).json({ error: "FORBIDDEN", message: "Akses lead ditolak" });
            return;
        }

        const state = await getLeadDistributionState(req.params.leadId);
        res.json(state);
    } catch (error) {
        next(error);
    }
});

router.post("/run-timeouts", requireRole("root_admin") as any, async (_req, res: Response, next: NextFunction) => {
    try {
        const processed = await processExpiredAttempts();
        res.json({ processed });
    } catch (error) {
        next(error);
    }
});

router.post("/stop-all", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const targetClientId =
            user.role === "root_admin"
                ? typeof req.body?.clientId === "string" && req.body.clientId.trim()
                    ? req.body.clientId
                    : null
                : user.clientId || null;
        const result = await stopAllActiveDistributions(targetClientId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.post("/leads/:leadId/start", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const targetClientId = user.role === "root_admin" ? null : user.clientId || null;
        const result = await startDistributionForHeldLead(req.params.leadId, targetClientId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
