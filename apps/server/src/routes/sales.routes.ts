import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as salesService from "../services/sales.service";
import { logger } from "../utils/logger";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (_req, res: Response) => {
    try {
        const rows = await salesService.getSalesUsers();
        res.json(rows);
    } catch (error) {
        logger.error("GET /sales error", { error, route: "GET /sales" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/", requireAdmin as any, async (req, res: Response) => {
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
            res.status(400).json({ error: "name, email, password are required" });
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
        if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
            res.status(409).json({ error: "Email already exists" });
            return;
        }
        logger.error("POST /sales error", { error, route: "POST /sales" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/queue/reorder", requireAdmin as any, async (req, res: Response) => {
    try {
        const { salesIds } = req.body ?? {};
        if (!Array.isArray(salesIds) || salesIds.length === 0) {
            res.status(400).json({ error: "salesIds array is required" });
            return;
        }

        const rows = await salesService.reorderSalesQueue(salesIds);
        res.json(rows);
    } catch (error) {
        if (
            error instanceof Error &&
            new Set([
                "INVALID_QUEUE_PAYLOAD",
                "QUEUE_EMPTY",
                "QUEUE_SIZE_MISMATCH",
                "UNKNOWN_SALES_IN_QUEUE",
            ]).has(error.message)
        ) {
            res.status(400).json({ error: error.message });
            return;
        }
        logger.error("PATCH /sales/queue/reorder error", { error, route: "PATCH /sales/queue/reorder" });
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/:id/queue", requireAdmin as any, async (req, res: Response) => {
    try {
        const { queueOrder, label } = req.body ?? {};
        if (typeof queueOrder !== "number" || !label) {
            res.status(400).json({ error: "queueOrder(number) and label are required" });
            return;
        }

        const updated = await salesService.upsertSalesQueue(
            req.params.id,
            queueOrder,
            label
        );
        res.json(updated);
    } catch (error) {
        logger.error("PATCH /sales/:id/queue error", { error, route: "PATCH /sales/:id/queue" });
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
