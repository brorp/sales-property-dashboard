import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as leadsService from "../services/leads.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { search, clientStatus, progress, assignedTo } = req.query;

        const leads = await leadsService.findAll(
            {
                search: search as string,
                clientStatus: clientStatus as string,
                progress: progress as string,
                assignedTo: assignedTo as string,
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
        const lead = await leadsService.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ error: "Lead not found" });
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
            assignedTo: assignedTo || user.id,
        });
        res.status(201).json(created);
    } catch (error) {
        console.error("POST /leads error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/:id/status", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { clientStatus, note } = req.body ?? {};
        if (!clientStatus) {
            res.status(400).json({ error: "clientStatus is required" });
            return;
        }

        const updated = await leadsService.updateLeadStatus({
            leadId: req.params.id,
            newStatus: clientStatus,
            changedBy: user.id,
            note,
        });

        if (!updated) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }
        res.json(updated);
    } catch (error) {
        console.error("PATCH /leads/:id/status error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/:id/progress", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { progress, note } = req.body ?? {};
        if (!progress) {
            res.status(400).json({ error: "progress is required" });
            return;
        }

        const updated = await leadsService.updateLeadProgress({
            leadId: req.params.id,
            newProgress: progress,
            changedBy: user.id,
            note,
        });

        if (!updated) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }
        res.json(updated);
    } catch (error) {
        console.error("PATCH /leads/:id/progress error:", error);
        res.status(500).json({ error: "Internal server error" });
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

        res.json(updated);
    } catch (error) {
        console.error("POST /leads/:id/assign error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/:id", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { clientStatus, progress, assignedTo, activityNote } = req.body ?? {};

        let updatedLead = await leadsService.findById(req.params.id);
        if (!updatedLead) {
            res.status(404).json({ error: "Lead not found" });
            return;
        }

        if (clientStatus) {
            await leadsService.updateLeadStatus({
                leadId: req.params.id,
                newStatus: clientStatus,
                changedBy: user.id,
                note: activityNote,
            });
        }

        if (progress) {
            await leadsService.updateLeadProgress({
                leadId: req.params.id,
                newProgress: progress,
                changedBy: user.id,
                note: activityNote,
            });
        }

        if (assignedTo && user.role === "admin") {
            await leadsService.assignLead({
                leadId: req.params.id,
                salesId: assignedTo,
                changedBy: user.id,
                note: activityNote,
            });
        }

        if (activityNote && !clientStatus && !progress && !assignedTo) {
            await leadsService.addActivity(req.params.id, { note: activityNote });
        }

        updatedLead = await leadsService.findById(req.params.id);
        res.json(updatedLead);
    } catch (error) {
        console.error("PATCH /leads/:id error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/:id/activities", async (req, res: Response) => {
    try {
        const { note } = req.body ?? {};
        if (!note) {
            res.status(400).json({ error: "note is required" });
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
