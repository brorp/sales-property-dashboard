import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as leadSourcesService from "../services/lead-sources.service";

const router: ReturnType<typeof Router> = Router();

function resolveClientIdFromRequest(
    req: AuthenticatedRequest,
    rawClientId: unknown
) {
    if (req.user.role === "root_admin") {
        return typeof rawClientId === "string" && rawClientId.trim() ? rawClientId : null;
    }

    return req.user.clientId || null;
}

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromRequest(requestUser, req.query.clientId);

        const rows = await leadSourcesService.listLeadSources(clientId);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromRequest(requestUser, req.body?.clientId);

        if (!clientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const created = await leadSourcesService.createLeadSource({
            clientId,
            value: req.body?.value,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromRequest(requestUser, req.body?.clientId);

        if (!clientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const updated = await leadSourcesService.updateLeadSource({
            id: req.params.id,
            clientId,
            value: req.body?.value,
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
        const clientId = resolveClientIdFromRequest(requestUser, req.query.clientId);

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
