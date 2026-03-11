import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin, requireMinRole } from "../middleware/rbac";
import * as leadsService from "../services/leads.service";

const router: ReturnType<typeof Router> = Router();

function canViewLeadByUser(
    lead: { assignedTo?: string | null } | null,
    reqUser: { id: string; role: string },
    scope?: { managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin" || reqUser.role === "client_admin") return true;
    if (reqUser.role === "supervisor") {
        if (lead.assignedTo === reqUser.id) return true;
        if (scope?.managedSalesIds?.includes(lead.assignedTo || "")) return true;
        return false;
    }
    return lead.assignedTo === reqUser.id;
}

function canEditLeadByUser(
    lead: { assignedTo?: string | null } | null,
    reqUser: { id: string; role: string },
    scope?: { managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin" || reqUser.role === "client_admin") {
        return !lead.assignedTo;
    }
    if (reqUser.role === "supervisor") {
        if (lead.assignedTo === reqUser.id) return true;
        if (scope?.managedSalesIds?.includes(lead.assignedTo || "")) return true;
        return !lead.assignedTo;
    }
    return lead.assignedTo === reqUser.id;
}

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            search,
            flowStatus,
            salesStatus,
            resultStatus,
            assignedTo,
            appointmentTag,
            domicileCity,
        } = req.query;

        const leads = await leadsService.findAll(
            {
                search: search as string,
                flowStatus: flowStatus as string,
                salesStatus: salesStatus as string,
                resultStatus: resultStatus as string,
                assignedTo: assignedTo as string,
                appointmentTag: appointmentTag as string,
                domicileCity: domicileCity as string,
            },
            user.id,
            user.role,
            (req as unknown as AuthenticatedRequest).scope
        );

        res.json(leads);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }
        if (!canViewLeadByUser(lead, user, (req as unknown as AuthenticatedRequest).scope)) {
            res.status(403).json({ error: "FORBIDDEN", message: "Anda tidak memiliki akses ke lead ini" });
            return;
        }
        res.json(lead);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { name, phone, source, assignedTo } = req.body ?? {};
        if (!name || !phone) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name dan phone wajib diisi" });
            return;
        }

        const created = await leadsService.create({
            name,
            phone,
            source: source || "Manual Input",
            assignedTo:
                (user.role === "client_admin" || user.role === "root_admin")
                    ? assignedTo || null
                    : user.id,
            clientId: user.clientId || null,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            name,
            domicileCity,
            salesStatus,
            resultStatus,
            unitName,
            unitDetail,
            paymentMethod,
            rejectedReason,
            rejectedNote,
            assignedTo,
            activityNote,
        } = req.body ?? {};

        const updated = await leadsService.patchLead({
            id: req.params.id,
            actorId: user.id,
            actorRole: user.role,
            name,
            domicileCity,
            salesStatus,
            resultStatus,
            unitName,
            unitDetail,
            paymentMethod,
            rejectedReason,
            rejectedNote,
            assignedTo,
            activityNote,
        });

        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        const fullLead = await leadsService.findById(req.params.id);
        res.json(fullLead || updated);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/assign", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { salesId, note } = req.body ?? {};
        if (!salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesId wajib diisi" });
            return;
        }

        const updated = await leadsService.assignLead({
            leadId: req.params.id,
            salesId,
            changedBy: user.id,
            note,
        });

        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        const fullLead = await leadsService.findById(req.params.id);
        res.json(fullLead || updated);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/activities", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { note } = req.body ?? {};
        if (!note) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "note wajib diisi" });
            return;
        }

        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }
        if (!canEditLeadByUser(lead, user)) {
            res.status(403).json({ error: "FORBIDDEN_LEAD_EDIT", message: "Hanya sales yang di-assign yang bisa mengubah lead ini" });
            return;
        }

        const newActivity = await leadsService.addActivity(req.params.id, { note });
        res.status(201).json(newActivity);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/appointments", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { date, time, location, notes } = req.body ?? {};
        if (!date || !time || !location) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "date, time, location wajib diisi" });
            return;
        }

        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }
        if (!canEditLeadByUser(lead, user)) {
            res.status(403).json({ error: "FORBIDDEN_LEAD_EDIT", message: "Hanya sales yang di-assign yang bisa mengubah lead ini" });
            return;
        }

        const created = await leadsService.addAppointment(req.params.id, {
            date,
            time,
            location,
            notes,
            salesId: user.id,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

export default router;
