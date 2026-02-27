import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as appointmentsService from "../services/appointments.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const rows = await appointmentsService.listAppointments(user.id, user.role);
        res.json(rows);
    } catch (error) {
        console.error("GET /appointments error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
