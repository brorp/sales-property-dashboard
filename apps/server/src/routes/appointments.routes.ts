import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as appointmentsService from "../services/appointments.service";
import * as leadsService from "../services/leads.service";
import { getWorkspaceClientId } from "../utils/request-client";
import { sendToUser } from "../services/push-notification.service";

const router: ReturnType<typeof Router> = Router();

function formatStatus(val: string | null | undefined): string {
    if (!val) return "-";
    return val
        .split(/[_-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
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
        return !lead.assignedTo;
    }
    if (reqUser.role === "client_admin") {
        return !lead.assignedTo;
    }
    if (reqUser.role === "supervisor") {
        return Boolean(scope?.managedSalesIds?.includes(lead.assignedTo || ""));
    }
    return lead.assignedTo === reqUser.id;
}

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const rows = await appointmentsService.listAppointments(user.id, user.role, scope, {
            salesId:
                typeof req.query.salesId === "string" && req.query.salesId.trim()
                    ? req.query.salesId
                    : null,
        });
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const workspaceClientId = getWorkspaceClientId(req as unknown as AuthenticatedRequest);
        const existing = await appointmentsService.getAppointmentById(req.params.id);

        if (!existing) {
            res.status(404).json({ error: "NOT_FOUND", message: "Appointment tidak ditemukan" });
            return;
        }

        const lead = await leadsService.findById(existing.leadId);
        if (user.role === "client_admin" && lead?.clientId !== workspaceClientId) {
            res.status(403).json({
                error: "FORBIDDEN_LEAD_EDIT",
                message: "Anda tidak memiliki akses mengubah appointment ini",
            });
            return;
        }
        if (!canEditLeadByUser(lead, user, scope)) {
            res.status(403).json({
                error: "FORBIDDEN_LEAD_EDIT",
                message: "Anda tidak memiliki akses mengubah appointment ini",
            });
            return;
        }

        const updated = await appointmentsService.updateAppointment({
            appointmentId: req.params.id,
            actorId: user.id,
            date: req.body?.date,
            time: req.body?.time,
            status: req.body?.status,
            location: req.body?.location,
            notes: req.body?.notes,
        });

        if (lead && lead.assignedTo && user.id !== lead.assignedTo) {
            const changes: string[] = [];
            if (req.body?.date && req.body.date !== existing.date) {
                changes.push(`tanggal menjadi ${req.body.date}`);
            }
            if (req.body?.time && req.body.time !== existing.time) {
                changes.push(`jam menjadi ${req.body.time}`);
            }
            if (req.body?.location && req.body.location !== existing.location) {
                changes.push(`lokasi menjadi ${req.body.location}`);
            }
            if (req.body?.status && req.body.status !== existing.status) {
                changes.push(`status menjadi "${formatStatus(req.body.status)}"`);
            }

            if (changes.length > 0) {
                const changesText = changes.join(", ");
                void sendToUser(lead.assignedTo, {
                    title: `Jadwal Lead Diubah: ${lead.name}`,
                    body: `Jadwal janji temu diubah (${changesText}) oleh ${user.name || "Supervisor"}.`,
                    data: { leadId: lead.id, type: "appointment_updated" },
                });
            }
        }

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/cancel", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const workspaceClientId = getWorkspaceClientId(req as unknown as AuthenticatedRequest);
        const existing = await appointmentsService.getAppointmentById(req.params.id);

        if (!existing) {
            res.status(404).json({ error: "NOT_FOUND", message: "Appointment tidak ditemukan" });
            return;
        }

        const lead = await leadsService.findById(existing.leadId);
        if (user.role === "client_admin" && lead?.clientId !== workspaceClientId) {
            res.status(403).json({
                error: "FORBIDDEN_LEAD_EDIT",
                message: "Anda tidak memiliki akses membatalkan appointment ini",
            });
            return;
        }
        if (!canEditLeadByUser(lead, user, scope)) {
            res.status(403).json({
                error: "FORBIDDEN_LEAD_EDIT",
                message: "Anda tidak memiliki akses membatalkan appointment ini",
            });
            return;
        }

        const updated = await appointmentsService.cancelAppointment({
            appointmentId: req.params.id,
            actorId: user.id,
            notes: req.body?.notes,
        });

        if (lead && lead.assignedTo && user.id !== lead.assignedTo) {
            void sendToUser(lead.assignedTo, {
                title: `Jadwal Lead Dibatalkan: ${lead.name}`,
                body: `Jadwal janji temu telah dibatalkan oleh ${user.name || "Supervisor"}.${req.body?.notes ? ` Alasan: ${req.body.notes}` : ""}`,
                data: { leadId: lead.id, type: "appointment_cancelled" },
            });
        }

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
