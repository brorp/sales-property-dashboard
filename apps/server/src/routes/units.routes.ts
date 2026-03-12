import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as unitsService from "../services/units.service";

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
        const clientId = resolveClientIdFromRequest(
            requestUser,
            req.query.clientId
        );

        if (!clientId) {
            res.json([]);
            return;
        }

        const rows = await unitsService.listUnits(clientId);
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

        const created = await unitsService.createUnit({
            clientId,
            projectType: req.body?.projectType,
            unitName: req.body?.unitName,
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

        const updated = await unitsService.updateUnit({
            id: req.params.id,
            clientId,
            projectType: req.body?.projectType,
            unitName: req.body?.unitName,
        });

        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "Unit tidak ditemukan" });
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

        const deleted = await unitsService.deleteUnit({
            id: req.params.id,
            clientId,
        });

        if (!deleted) {
            res.status(404).json({ error: "NOT_FOUND", message: "Unit tidak ditemukan" });
            return;
        }

        res.json({ success: true, id: deleted.id });
    } catch (error) {
        next(error);
    }
});

export default router;
