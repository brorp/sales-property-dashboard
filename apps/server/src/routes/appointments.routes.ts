import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as appointmentsService from "../services/appointments.service";

const router: ReturnType<typeof Router> = Router();

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const rows = await appointmentsService.listAppointments(user.id, user.role, scope);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

export default router;
