import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as notificationSummaryService from "../services/notification-summary.service";

const router: ReturnType<typeof Router> = Router();

router.get("/summary", async (req, res: Response, next: NextFunction) => {
    try {
        const { user, scope } = req as unknown as AuthenticatedRequest;
        const summary = await notificationSummaryService.getNotificationSummary(
            user.id,
            user.role,
            scope
        );
        res.json(summary);
    } catch (error) {
        next(error);
    }
});

export default router;
