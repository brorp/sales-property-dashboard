import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { uploadImageDataUrl } from "../services/imagekit.service";

const router: ReturnType<typeof Router> = Router();

router.post("/imagekit", async (req, res: Response, next: NextFunction) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const dataUrl = String(req.body?.dataUrl || "").trim();
        const fileName = String(req.body?.fileName || "proof.png").trim();
        if (!dataUrl) {
            res.status(400).json({
                error: "UPLOAD_IMAGE_REQUIRED",
                message: "Screenshot wajib diupload",
            });
            return;
        }

        const folder = `/property-lounge/daily-tasks/${user.clientId || "shared"}/${user.id}`;
        const url = await uploadImageDataUrl({
            dataUrl,
            fileName,
            folder,
        });

        res.json({ url });
    } catch (error) {
        next(error);
    }
});

export default router;
