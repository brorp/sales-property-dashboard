import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as supervisorTasksService from "../services/supervisor-tasks.service";

const router: ReturnType<typeof Router> = Router();

// GET /api/supervisor-tasks — list HOT leads pending validation (supervisor only)
router.get(
    "/",
    requireMinRole("supervisor") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user, scope } = req as unknown as AuthenticatedRequest;

            const managedSalesIds = scope?.managedSalesIds || [];
            const leads = await supervisorTasksService.listPendingHotLeads({
                supervisorId: user.id,
                managedSalesIds,
            });

            res.json(leads);
        } catch (error) {
            next(error);
        }
    }
);

router.get(
    "/submitted-daily-tasks",
    requireMinRole("supervisor") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { scope } = req as unknown as AuthenticatedRequest;

            const groups = await supervisorTasksService.listSubmittedDailyTasksByManagedSales({
                managedSalesIds: scope?.managedSalesIds || [],
                clientId: scope?.clientId || null,
            });

            res.json(groups);
        } catch (error) {
            next(error);
        }
    }
);

// POST /api/supervisor-tasks/:leadId/validate — validate a HOT lead
router.post(
    "/:leadId/validate",
    requireMinRole("supervisor") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user, scope } = req as unknown as AuthenticatedRequest;
            const { leadId } = req.params;

            // Verify the lead belongs to one of the supervisor's managed sales
            const managedSalesIds = scope?.managedSalesIds || [];
            if (managedSalesIds.length === 0) {
                res.status(403).json({
                    error: "FORBIDDEN",
                    message: "Tidak ada sales yang dikelola supervisor ini",
                });
                return;
            }

            const result = await supervisorTasksService.validateHotLead({
                leadId,
                supervisorId: user.id,
                supervisorName: user.name,
            });

            res.json(result);
        } catch (error) {
            const err = error as Error;
            if (err.message === "LEAD_NOT_FOUND") {
                res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
                return;
            }
            if (err.message === "LEAD_NOT_HOT") {
                res.status(400).json({ error: "LEAD_NOT_HOT", message: "Lead ini bukan status HOT" });
                return;
            }
            if (err.message === "LEAD_ALREADY_VALIDATED") {
                res.status(400).json({ error: "LEAD_ALREADY_VALIDATED", message: "Lead ini sudah pernah divalidasi" });
                return;
            }
            next(error);
        }
    }
);

// POST /api/supervisor-tasks/:leadId/reject — reject a HOT lead and revert to warm
router.post(
    "/:leadId/reject",
    requireMinRole("supervisor") as any,
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user, scope } = req as unknown as AuthenticatedRequest;
            const { leadId } = req.params;
            const { note } = req.body ?? {};

            const managedSalesIds = scope?.managedSalesIds || [];
            if (managedSalesIds.length === 0) {
                res.status(403).json({
                    error: "FORBIDDEN",
                    message: "Tidak ada sales yang dikelola supervisor ini",
                });
                return;
            }

            const result = await supervisorTasksService.rejectHotLead({
                leadId,
                supervisorId: user.id,
                supervisorName: user.name,
                note: typeof note === "string" ? note.trim() || undefined : undefined,
            });

            res.json(result);
        } catch (error) {
            const err = error as Error;
            if (err.message === "LEAD_NOT_FOUND") {
                res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
                return;
            }
            if (err.message === "LEAD_NOT_HOT") {
                res.status(400).json({ error: "LEAD_NOT_HOT", message: "Lead ini bukan status HOT" });
                return;
            }
            next(error);
        }
    }
);

// GET /api/supervisor-tasks/validated-hot — for sales: list own validated HOT leads
router.get(
    "/validated-hot",
    async (req, res: Response, next: NextFunction) => {
        try {
            const { user } = req as unknown as AuthenticatedRequest;

            if (user.role !== "sales") {
                res.status(403).json({ error: "FORBIDDEN", message: "Hanya sales yang bisa mengakses endpoint ini" });
                return;
            }

            const leads = await supervisorTasksService.listValidatedHotLeads({
                salesId: user.id,
            });

            res.json(leads);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
