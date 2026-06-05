import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as notificationSummaryService from "../services/notification-summary.service";
import { db } from "../db/index";
import { fcmToken } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: ReturnType<typeof Router> = Router();

router.get("/summary", async (req, res: Response, next: NextFunction) => {
    try {
        const { user: authUser, scope } = req as unknown as AuthenticatedRequest;
        const summary = await notificationSummaryService.getNotificationSummary(
            authUser.id,
            authUser.role,
            scope
        );
        res.json(summary);
    } catch (error) {
        next(error);
    }
});

router.post("/fcm-token", async (req, res: Response, next: NextFunction) => {
    try {
        const { user: authUser } = req as unknown as AuthenticatedRequest;
        const { token, deviceLabel } = req.body ?? {};
        if (!token || typeof token !== "string") {
            res.status(400).json({ error: "token wajib diisi" });
            return;
        }
        // Upsert: kalau token sudah ada, update lastUsedAt-nya saja
        await db
            .insert(fcmToken)
            .values({
                id: randomUUID(),
                userId: authUser.id,
                token,
                deviceLabel: deviceLabel ?? null,
                lastUsedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: fcmToken.token,
                set: { lastUsedAt: new Date() },
            });
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

router.delete("/fcm-token", async (req, res: Response, next: NextFunction) => {
    try {
        const { user: authUser } = req as unknown as AuthenticatedRequest;
        const { token } = req.body ?? {};
        if (token) {
            // Hapus token spesifik (saat logout dari device ini)
            await db.delete(fcmToken).where(eq(fcmToken.token, token));
        } else {
            // Hapus semua token user (saat deactivate / full logout)
            await db.delete(fcmToken).where(eq(fcmToken.userId, authUser.id));
        }
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

export default router;
