import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as leadSourcesService from "../services/lead-sources.service";
import { resolveClientIdFromWorkspace } from "../utils/request-client";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.query.clientId);

        const rows = await leadSourcesService.listLeadSources(clientId);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.get("/agent-offices", async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.query.clientId);
        const rows = await leadSourcesService.listAgentOfficeNames(clientId);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.body?.clientId);

        if (!clientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const created = await leadSourcesService.createLeadSource({
            clientId,
            value: req.body?.value || req.body?.name,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.body?.clientId);

        if (!clientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const updated = await leadSourcesService.updateLeadSource({
            id: req.params.id,
            clientId,
            value: req.body?.value || req.body?.name,
        });

        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "Source lead tidak ditemukan" });
            return;
        }

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromWorkspace(requestUser, req.query.clientId);

        if (!clientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const deleted = await leadSourcesService.deleteLeadSource({
            id: req.params.id,
            clientId,
        });

        if (!deleted) {
            res.status(404).json({ error: "NOT_FOUND", message: "Source lead tidak ditemukan" });
            return;
        }

        res.json({ success: true, id: deleted.id });
    } catch (error) {
        next(error);
    }
});

export default router;
