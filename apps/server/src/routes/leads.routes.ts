import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import { db } from "../db/index";
import { user as userTable } from "../db/schema";
import { eq } from "drizzle-orm";
import * as leadsService from "../services/leads.service";

const router: ReturnType<typeof Router> = Router();

function canViewLeadByUser(
    lead: { clientId?: string | null; assignedTo?: string | null } | null,
    reqUser: { id: string; role: string; clientId?: string | null },
    scope?: { managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin") return true;
    if (reqUser.role === "client_admin") return lead.clientId === (reqUser.clientId || null);
    if (reqUser.role === "supervisor") {
        if (scope?.managedSalesIds?.includes(lead.assignedTo || "")) return true;
        return false;
    }
    return lead.assignedTo === reqUser.id;
}

function canEditLeadByUser(
    lead: { clientId?: string | null; assignedTo?: string | null } | null,
    reqUser: { id: string; role: string; clientId?: string | null },
    scope?: { managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin") {
        return !lead.assignedTo;
    }
    if (reqUser.role === "client_admin") {
        return lead.clientId === (reqUser.clientId || null) && !lead.assignedTo;
    }
    if (reqUser.role === "supervisor") {
        if (scope?.managedSalesIds?.includes(lead.assignedTo || "")) return true;
        return false;
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
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const { name, phone, source, assignedTo } = req.body ?? {};
        if (!name || !phone) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name dan phone wajib diisi" });
            return;
        }

        if ((user.role === "client_admin" || user.role === "root_admin") && assignedTo) {
            const [salesRow] = await db
                .select({
                    id: userTable.id,
                    role: userTable.role,
                    clientId: userTable.clientId,
                    isActive: userTable.isActive,
                })
                .from(userTable)
                .where(eq(userTable.id, assignedTo))
                .limit(1);

            if (!salesRow || salesRow.role !== "sales" || !salesRow.isActive) {
                res.status(400).json({ error: "INVALID_ASSIGNED_SALES", message: "salesId tidak valid" });
                return;
            }

            if (user.role === "client_admin" && salesRow.clientId !== user.clientId) {
                res.status(403).json({ error: "FORBIDDEN_ASSIGN", message: "Sales harus berada di client yang sama" });
                return;
            }

        }

        const created = await leadsService.create({
            name,
            phone,
            source: source || "Manual Input",
            assignedTo:
                (user.role === "client_admin" || user.role === "root_admin")
                    ? assignedTo || null
                    : user.role === "sales"
                        ? user.id
                        : null,
            clientId: user.clientId || null,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const {
            name,
            domicileCity,
            salesStatus,
            interestUnitId,
            resultStatus,
            unitName,
            unitDetail,
            paymentMethod,
            rejectedReason,
            rejectedNote,
            assignedTo,
            activityNote,
        } = req.body ?? {};

        const currentLead = await leadsService.findById(req.params.id);
        if (!currentLead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        if (!canEditLeadByUser(currentLead, user, scope)) {
            res.status(403).json({ error: "FORBIDDEN_LEAD_EDIT", message: "Anda tidak memiliki akses edit ke lead ini" });
            return;
        }

        const updated = await leadsService.patchLead({
            id: req.params.id,
            actorId: user.id,
            actorRole: user.role,
            actorClientId: user.clientId || null,
            managedSalesIds: scope?.managedSalesIds || [],
            name,
            domicileCity,
            salesStatus,
            interestUnitId,
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
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const { salesId, note } = req.body ?? {};
        if (!salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesId wajib diisi" });
            return;
        }

        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        const [salesRow] = await db
            .select({
                id: userTable.id,
                role: userTable.role,
                clientId: userTable.clientId,
                isActive: userTable.isActive,
            })
            .from(userTable)
            .where(eq(userTable.id, salesId))
            .limit(1);

        if (!salesRow || salesRow.role !== "sales" || !salesRow.isActive) {
            res.status(400).json({ error: "INVALID_ASSIGNED_SALES", message: "salesId tidak valid" });
            return;
        }

        if (salesRow.clientId !== lead.clientId) {
            res.status(400).json({ error: "INVALID_ASSIGNED_SALES", message: "salesId harus berada di client yang sama" });
            return;
        }

        if (user.role === "client_admin" && lead.clientId !== user.clientId) {
            res.status(403).json({ error: "FORBIDDEN_ASSIGN", message: "Lead berada di luar client Anda" });
            return;
        }

        if (user.role === "supervisor" && lead.clientId !== user.clientId) {
            res.status(403).json({ error: "FORBIDDEN_ASSIGN", message: "Lead berada di luar client supervisor ini" });
            return;
        }

        if (user.role === "supervisor" && !scope?.managedSalesIds?.includes(salesId)) {
            res.status(403).json({ error: "FORBIDDEN_ASSIGN", message: "Sales harus berada di bawah supervisor ini" });
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
        if (!canEditLeadByUser(lead, user, (req as unknown as AuthenticatedRequest).scope)) {
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
        if (!canEditLeadByUser(lead, user, (req as unknown as AuthenticatedRequest).scope)) {
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
