import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole, requireRole } from "../middleware/rbac";
import { db } from "../db/index";
import { user as userTable } from "../db/schema";
import { eq } from "drizzle-orm";
import * as leadsService from "../services/leads.service";
import * as leadTransferService from "../services/lead-transfer.service";
import * as adminPasswordService from "../services/admin-password.service";
import { getWorkspaceClientId, resolveClientIdFromWorkspace } from "../utils/request-client";
import { normalizeResultStatus } from "../utils/lead-workflow";

const router: ReturnType<typeof Router> = Router();
const JAKARTA_OFFSET = "+07:00";

function parseJakartaDateInput(value: unknown, options: { dateOnly?: boolean } = {}) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === "") {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const timePart = options.dateOnly ? "00:00:00" : "00:00:00";
        const date = new Date(`${trimmed}T${timePart}${JAKARTA_OFFSET}`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
        const date = new Date(`${trimmed}:00${JAKARTA_OFFSET}`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        const date = new Date(`${trimmed}${JAKARTA_OFFSET}`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
}

function canViewLeadByUser(
    lead: { clientId?: string | null; assignedTo?: string | null } | null,
    reqUser: { id: string; role: string; clientId?: string | null },
    scope?: { clientId?: string | null; managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (reqUser.role === "root_admin") return true;
    if (scope?.clientId && lead.clientId !== scope.clientId) return false;
    if (reqUser.role === "client_admin") return true;
    if (reqUser.role === "supervisor") {
        if (scope?.managedSalesIds?.includes(lead.assignedTo || "")) return true;
        return false;
    }
    return lead.assignedTo === reqUser.id;
}

function canEditLeadByUser(
    lead: { clientId?: string | null; assignedTo?: string | null } | null,
    reqUser: { id: string; role: string; clientId?: string | null },
    scope?: { clientId?: string | null; managedSalesIds?: string[] }
) {
    if (!lead) return false;
    if (scope?.clientId && reqUser.role !== "root_admin" && lead.clientId !== scope.clientId) {
        return false;
    }
    if (reqUser.role === "root_admin") {
        return true;
    }
    if (reqUser.role === "client_admin") {
        return true;
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
            source,
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
                source: source as string,
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

router.post("/import-reassign/preview", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { csvText, rows, targetSalesId } = req.body ?? {};

        if ((!csvText && !Array.isArray(rows)) || !targetSalesId) {
            res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "rows/csvText dan targetSalesId wajib diisi",
            });
            return;
        }

        const preview = await leadTransferService.previewLeadReassignmentImport(
            {
                csvText: typeof csvText === "string" ? csvText : undefined,
                rows: Array.isArray(rows) ? rows : undefined,
            },
            String(targetSalesId),
            {
                actorId: user.id,
                actorRole: user.role,
                actorClientId: getWorkspaceClientId(req as unknown as AuthenticatedRequest),
            }
        );

        res.json(preview);
    } catch (error) {
        next(error);
    }
});

router.post("/import-reassign/commit", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { csvText, rows, targetSalesId, fileName } = req.body ?? {};

        if ((!csvText && !Array.isArray(rows)) || !targetSalesId) {
            res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "rows/csvText dan targetSalesId wajib diisi",
            });
            return;
        }

        const committed = await leadTransferService.commitLeadReassignmentImport({
            csvText: typeof csvText === "string" ? csvText : undefined,
            rows: Array.isArray(rows) ? rows : undefined,
            targetSalesId: String(targetSalesId),
            fileName: typeof fileName === "string" ? fileName : undefined,
            actor: {
                actorId: user.id,
                actorRole: user.role,
                actorClientId: getWorkspaceClientId(req as unknown as AuthenticatedRequest),
            },
        });

        res.json(committed);
    } catch (error) {
        next(error);
    }
});

router.post("/export/authorize", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        leadTransferService.assertLeadExportAccessCode(req.body?.accessCode);
        res.json({ success: true });
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

router.post("/:id/accept", requireRole("sales") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const currentLead = await leadsService.findById(req.params.id);
        if (!currentLead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        if (currentLead.assignedTo !== user.id) {
            res.status(403).json({ error: "FORBIDDEN_LEAD_ACCEPT", message: "Anda tidak memiliki akses menerima lead ini" });
            return;
        }

        const accepted = await leadsService.acceptLead({
            leadId: req.params.id,
            actorId: user.id,
            actorName: user.name,
        });

        res.json(accepted);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/reassign", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { targetSalesId, note } = req.body ?? {};

        if (!targetSalesId || typeof targetSalesId !== "string") {
            res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "targetSalesId wajib diisi",
            });
            return;
        }

        const result = await leadTransferService.reassignLeadManually({
            leadId: req.params.id,
            targetSalesId,
            note: typeof note === "string" ? note : null,
            actor: {
                actorId: user.id,
                actorRole: user.role,
                actorClientId: getWorkspaceClientId(req as unknown as AuthenticatedRequest),
                actorName: user.name,
            },
        });

        const fullLead = await leadsService.findById(req.params.id);
        res.json({
            ...result,
            lead: fullLead,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/:id/customer-pipeline", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const currentLead = await leadsService.findById(req.params.id);
        if (!currentLead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        if (!canViewLeadByUser(currentLead, user, scope)) {
            res.status(403).json({ error: "FORBIDDEN", message: "Anda tidak memiliki akses ke lead ini" });
            return;
        }

        res.json(currentLead.customerPipeline || []);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/customer-pipeline/:stepNo/complete", requireRole("sales") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const currentLead = await leadsService.findById(req.params.id);
        if (!currentLead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        if (currentLead.assignedTo !== user.id) {
            res.status(403).json({ error: "FORBIDDEN_CUSTOMER_PIPELINE_UPDATE", message: "Hanya sales owner yang bisa mengubah customer pipeline" });
            return;
        }

        const updated = await leadsService.completeCustomerPipelineStep({
            leadId: req.params.id,
            stepNo: Number(req.params.stepNo),
            note: req.body?.note,
            actorId: user.id,
            actorName: user.name,
        });

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { name, phone, source, assignedTo, agentOfficeName, createdAt: createdAtRaw } = req.body ?? {};
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

        }

        const targetClientId = resolveClientIdFromWorkspace(
            req as unknown as AuthenticatedRequest
        );

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "Workspace aktif tidak ditemukan" });
            return;
        }

        const parsedCreatedAt = parseJakartaDateInput(createdAtRaw);
        const created = await leadsService.create({
            name,
            phone,
            source: source || "Online",
            agentOfficeName,
            assignedTo:
                (user.role === "client_admin" || user.role === "root_admin")
                    ? assignedTo || null
                    : user.role === "sales"
                        ? user.id
                        : null,
            clientId: targetClientId,
            createdAt: parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null,
            createdByName: user.name,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.post("/bulk-update", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const ids: string[] = Array.isArray(req.body?.ids)
            ? Array.from(new Set(req.body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)))
            : [];
        const salesStatus = typeof req.body?.salesStatus === "string" ? req.body.salesStatus.trim() : "";

        if (ids.length === 0) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "Pilih minimal satu lead." });
            return;
        }
        if (!salesStatus) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "Status L2 wajib dipilih." });
            return;
        }

        const results: Array<{ id: string; status: "updated" | "error"; message?: string }> = [];
        for (const id of ids) {
            try {
                const currentLead = await leadsService.findById(id);
                if (!currentLead) {
                    results.push({ id, status: "error", message: "Lead tidak ditemukan" });
                    continue;
                }
                if (!canEditLeadByUser(currentLead, user, scope)) {
                    results.push({ id, status: "error", message: "Tidak punya akses edit lead ini" });
                    continue;
                }

                await leadsService.patchLead({
                    id,
                    actorId: user.id,
                    actorRole: user.role,
                    actorClientId: getWorkspaceClientId(req as unknown as AuthenticatedRequest),
                    managedSalesIds: scope?.managedSalesIds || [],
                    salesStatus,
                });
                results.push({ id, status: "updated" });
            } catch (error) {
                results.push({
                    id,
                    status: "error",
                    message: error instanceof Error ? error.message : "Gagal update lead",
                });
            }
        }

        const updated = results.filter((item) => item.status === "updated").length;
        const failed = results.length - updated;
        res.json({ updated, failed, results });
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const {
            name,
            source,
            agentOfficeName,
            manualNote,
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
            createdAt,
            resultStatusUpdatedAt,
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

        const isAdminRole = user.role === "root_admin" || user.role === "client_admin";
        const currentResultStatus = normalizeResultStatus(currentLead.resultStatus);
        const touchesLockedLeadFields = [
            salesStatus,
            resultStatus,
            name,
            source,
            agentOfficeName,
            domicileCity,
            interestUnitId,
            unitName,
            unitDetail,
            paymentMethod,
            rejectedReason,
            rejectedNote,
        ].some((value) => value !== undefined);
        if (!isAdminRole && currentResultStatus === "lunas" && touchesLockedLeadFields) {
            res.status(400).json({ error: "LOCKED_LEAD", message: "Lead yang sudah Lunas telah dikunci secara permanen dan tidak dapat diubah datanya." });
            return;
        }

        const updated = await leadsService.patchLead({
            id: req.params.id,
            actorId: user.id,
            actorRole: user.role,
            actorClientId: getWorkspaceClientId(req as unknown as AuthenticatedRequest),
            managedSalesIds: scope?.managedSalesIds || [],
            name,
            source,
            agentOfficeName,
            manualNote,
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
            createdAt: parseJakartaDateInput(createdAt) ?? undefined,
            resultStatusUpdatedAt: parseJakartaDateInput(resultStatusUpdatedAt, { dateOnly: true }),
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

        const workspaceClientId = getWorkspaceClientId(req as unknown as AuthenticatedRequest);

        if (user.role === "client_admin" && lead.clientId !== workspaceClientId) {
            res.status(403).json({ error: "FORBIDDEN_ASSIGN", message: "Lead berada di luar client Anda" });
            return;
        }

        if (user.role === "supervisor" && lead.clientId !== workspaceClientId) {
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

router.delete("/:id", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const authReq = req as unknown as AuthenticatedRequest;
        const { user } = authReq;
        const currentLead = await leadsService.findById(req.params.id);

        if (!currentLead) {
            res.status(404).json({ error: "NOT_FOUND", message: "Lead tidak ditemukan" });
            return;
        }

        const workspaceClientId = getWorkspaceClientId(authReq);
        if (workspaceClientId && currentLead.clientId !== workspaceClientId) {
            res.status(403).json({ error: "FORBIDDEN_LEAD_DELETE", message: "Lead ini tidak berada pada workspace aktif" });
            return;
        }

        await adminPasswordService.assertAdminPasswordConfirmation({
            actorUserId: user.id,
            actorRole: user.role,
            password: req.body?.passwordConfirmation,
        });

        const deleted = await leadsService.deleteLead({
            leadId: req.params.id,
            actorId: user.id,
            actorRole: user.role,
            actorClientId: workspaceClientId,
        });

        res.json({ success: true, deleted });
    } catch (error) {
        next(error);
    }
});

export default router;
