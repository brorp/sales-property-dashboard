import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import * as salesService from "../services/sales.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        // Scope sales list: root_admin sees all, others see their client
        const clientId = user.role === "root_admin" ? null : user.clientId;
        const rows = await salesService.getSalesUsers(clientId);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            queueOrder,
            queueLabel,
        } = req.body ?? {};

        if (!name || !email || !password) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name, email, password wajib diisi" });
            return;
        }

        const created = await salesService.createSalesUser({
            name,
            email,
            password,
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

router.patch("/queue/reorder", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { salesIds } = req.body ?? {};
        if (!Array.isArray(salesIds) || salesIds.length === 0) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "salesIds array wajib diisi" });
            return;
        }

        const rows = await salesService.reorderSalesQueue(salesIds);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/queue", requireAdmin as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { queueOrder, label } = req.body ?? {};
        if (typeof queueOrder !== "number" || !label) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "queueOrder (number) dan label wajib diisi" });
            return;
        }

        const updated = await salesService.upsertSalesQueue(
            req.params.id,
            queueOrder,
            label
        );
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

export default router;
