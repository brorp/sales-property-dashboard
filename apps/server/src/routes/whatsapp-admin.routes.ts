import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
    getWhatsAppQrAdminState,
    resetWhatsAppQrSession,
    startWhatsAppQrBridge,
    stopWhatsAppQrBridge,
} from "../services/whatsapp-qr.service";

const router: ReturnType<typeof Router> = Router();

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
    const configuredToken = process.env.ADMIN_WHATSAPP_TOKEN;
    if (!configuredToken) {
        next();
        return;
    }

    const tokenFromHeader = req.header("x-admin-token");
    if (tokenFromHeader !== configuredToken) {
        res.status(401).json({ error: "Unauthorized admin token" });
        return;
    }
    next();
}

router.use(requireAdminToken as any);

router.get("/status", (_req, res: Response) => {
    res.json(getWhatsAppQrAdminState());
});

router.post("/start", async (_req, res: Response) => {
    await startWhatsAppQrBridge();
    res.json(getWhatsAppQrAdminState());
});

router.post("/stop", async (_req, res: Response) => {
    await stopWhatsAppQrBridge();
    res.json(getWhatsAppQrAdminState());
});

router.post("/restart", async (_req, res: Response) => {
    await resetWhatsAppQrSession();
    await startWhatsAppQrBridge();
    res.json(getWhatsAppQrAdminState());
});

router.post("/reset", async (_req, res: Response) => {
    await resetWhatsAppQrSession();
    await startWhatsAppQrBridge();
    res.json(getWhatsAppQrAdminState());
});

export default router;
