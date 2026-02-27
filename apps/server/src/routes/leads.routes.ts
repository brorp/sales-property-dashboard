import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as leadsService from "../services/leads.service";

const router: ReturnType<typeof Router> = Router();

function errorResponseFromCode(error: unknown) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    if (code === "FORBIDDEN_ASSIGN") {
        return {
            status: 403,
            body: { error: "Only admin can reassign lead owner" },
        };
    }

    if (code === "FORBIDDEN_LEAD_EDIT") {
        return {
            status: 403,
            body: { error: "Only assigned sales can update this lead" },
        };
    }

    if (code === "ADMIN_ASSIGNED_LEAD_READ_ONLY") {
        return {
            status: 403,
            body: { error: "Assigned leads are read-only for admin" },
        };
    }

    const badRequestCodes = new Set([
        "INVALID_SALES_STATUS",
        "INVALID_RESULT_STATUS",
        "SALES_STATUS_REQUIRES_ASSIGNED",
        "RESULT_STATUS_REQUIRES_SUDAH_SURVEY",
        "CLOSING_FIELDS_REQUIRE_CLOSING_STATUS",
        "CLOSING_FIELDS_REQUIRED",
        "REJECT_REASON_REQUIRES_BATAL_STATUS",
        "REJECT_REASON_REQUIRED",
    ]);

    if (badRequestCodes.has(code)) {
        return {
            status: 400,
            body: { error: code },
        };
    }

    return {
        status: 500,
        body: { error: "Internal server error" },
    };
}

function canViewLeadByUser(
    lead: { assignedTo?: string | null } | null,
    reqUser: { id: string; role: string }
) {
    if (!lead) {
        return false;
    }
    if (reqUser.role === "admin") {
        return true;
    }
    return lead.assignedTo === reqUser.id;
}

function canEditLeadByUser(
    lead: { assignedTo?: string | null } | null,
    reqUser: { id: string; role: string }
) {
    if (!lead) {
        return false;
    }
    if (reqUser.role === "admin") {
        return !lead.assignedTo;
    }
    return lead.assignedTo === reqUser.id;
}

router.get("/", async (req, res: Response) => {
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
            user.role
        );

        res.json(leads);
    } catch (error) {
        console.error("GET /leads error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }
        if (!canViewLeadByUser(lead, user)) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        res.json(lead);
    } catch (error) {
        console.error("GET /leads/:id error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { name, phone, source, assignedTo } = req.body ?? {};
        if (!name || !phone) {
            res.status(400).json({ error: "name and phone are required" });
            return;
        }

        const created = await leadsService.create({
            name,
            phone,
            source: source || "Manual Input",
            assignedTo:
                user.role === "admin"
                    ? assignedTo || null
                    : user.id,
        });
        res.status(201).json(created);
    } catch (error) {
        console.error("POST /leads error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/:id", async (req, res: Response) => {
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
            res.status(404).json({ error: "Lead not found" });
            return;
        }

        const fullLead = await leadsService.findById(req.params.id);
        res.json(fullLead || updated);
    } catch (error) {
        console.error("PATCH /leads/:id error:", error);
        const mapped = errorResponseFromCode(error);
        res.status(mapped.status).json(mapped.body);
    }
});

router.post("/:id/assign", requireAdmin as any, async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { salesId, note } = req.body ?? {};
        if (!salesId) {
            res.status(400).json({ error: "salesId is required" });
            return;
        }

        const updated = await leadsService.assignLead({
            leadId: req.params.id,
            salesId,
            changedBy: user.id,
            note,
        });

        if (!updated) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }

        const fullLead = await leadsService.findById(req.params.id);
        res.json(fullLead || updated);
    } catch (error) {
        console.error("POST /leads/:id/assign error:", error);
        const mapped = errorResponseFromCode(error);
        res.status(mapped.status).json(mapped.body);
    }
});

router.post("/:id/activities", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { note } = req.body ?? {};
        if (!note) {
            res.status(400).json({ error: "note is required" });
            return;
        }

        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }
        if (!canEditLeadByUser(lead, user)) {
            res.status(403).json({ error: "Only assigned sales can update this lead" });
            return;
        }

        const newActivity = await leadsService.addActivity(req.params.id, { note });
        res.status(201).json(newActivity);
    } catch (error) {
        console.error("POST /leads/:id/activities error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/:id/appointments", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { date, time, location, notes } = req.body ?? {};
        if (!date || !time || !location) {
            res.status(400).json({ error: "date, time, location are required" });
            return;
        }

        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }
        if (!canEditLeadByUser(lead, user)) {
            res.status(403).json({ error: "Only assigned sales can update this lead" });
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
        console.error("POST /leads/:id/appointments error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
