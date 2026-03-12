import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireMinRole } from "../middleware/rbac";
import * as salesService from "../services/sales.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const rows = await salesService.getSalesUsers({
            clientId: user.role === "root_admin" ? null : user.clientId,
            supervisorId: user.role === "supervisor" ? user.id : null,
            salesId: user.role === "sales" ? user.id : null,
        });
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const {
            name,
            email,
            password,
            phone,
            queueOrder,
            queueLabel,
            supervisorId,
            clientId,
        } = req.body ?? {};

        if (!name || !email || !password) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name, email, password wajib diisi" });
            return;
        }

        const targetClientId =
            user.role === "root_admin"
                ? clientId
                : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId wajib diisi" });
            return;
        }

        const created = await salesService.createSalesUser({
            name,
            email,
            password,
            clientId: targetClientId,
            createdByUserId: user.id,
            supervisorId: user.role === "supervisor" ? user.id : supervisorId || null,
            phone,
            queueOrder:
                typeof queueOrder === "number"
                    ? queueOrder
                    : queueOrder
                        ? Number(queueOrder)
                        : null,
            queueLabel,
        });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.get("/queue", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const targetClientId =
            user.role === "root_admin"
                ? typeof req.query.clientId === "string" && req.query.clientId.trim()
                    ? req.query.clientId
                    : null
                : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const queueState = await salesService.getDistributionQueue(targetClientId);
        res.json(queueState);
    } catch (error) {
        next(error);
    }
});

router.post("/queue", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { salesId, queueOrder, clientId } = req.body ?? {};
        if (!salesId || typeof salesId !== "string") {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesId wajib diisi" });
            return;
        }

        const targetClientId =
            user.role === "root_admin"
                ? typeof clientId === "string" && clientId.trim()
                    ? clientId
                    : null
                : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const queueState = await salesService.addSalesToQueue({
            clientId: targetClientId,
            salesId,
            queueOrder:
                typeof queueOrder === "number"
                    ? queueOrder
                    : queueOrder
                        ? Number(queueOrder)
                        : null,
        });
        res.status(201).json(queueState);
    } catch (error) {
        next(error);
    }
});

router.patch("/queue/reorder", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { salesIds, clientId } = req.body ?? {};
        if (!Array.isArray(salesIds) || salesIds.length === 0) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesIds array wajib diisi" });
            return;
        }

        const targetClientId = user.role === "root_admin" ? clientId : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const rows = await salesService.reorderSalesQueue(targetClientId, salesIds);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.delete("/queue/:salesId", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const targetClientId =
            user.role === "root_admin"
                ? typeof req.query.clientId === "string" && req.query.clientId.trim()
                    ? req.query.clientId
                    : null
                : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const queueState = await salesService.removeSalesFromQueue({
            clientId: targetClientId,
            salesId: req.params.salesId,
        });
        res.json(queueState);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/queue", requireMinRole("client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { queueOrder, label, clientId } = req.body ?? {};
        if (typeof queueOrder !== "number" || !label) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "queueOrder (number) dan label wajib diisi" });
            return;
        }

        const targetClientId = user.role === "root_admin" ? clientId : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const updated = await salesService.upsertSalesQueue(
            req.params.id,
            targetClientId,
            queueOrder,
            label
        );
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.patch("/supervisor/assign", requireMinRole("supervisor") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { salesIds, supervisorId, clientId } = req.body ?? {};

        if (!Array.isArray(salesIds) || salesIds.length === 0) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesIds array wajib diisi" });
            return;
        }

        const targetClientId = user.role === "root_admin" ? clientId : user.clientId;

        if (!targetClientId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "clientId tidak ditemukan untuk user ini" });
            return;
        }

        const updated = await salesService.assignSalesSupervisor({
            salesIds,
            supervisorId: user.role === "supervisor" ? user.id : supervisorId || null,
            clientId: targetClientId,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
