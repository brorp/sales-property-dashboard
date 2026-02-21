import { Router } from "express";
import type { Response } from "express";
import { requireAdmin } from "../middleware/rbac";
import * as salesService from "../services/sales.service";

const router = Router();

router.get("/", async (_req, res: Response) => {
    try {
        const rows = await salesService.getSalesUsers();
        res.json(rows);
    } catch (error) {
        console.error("GET /sales error:", error);
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
        console.error("PATCH /sales/:id/queue error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
