import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as profileService from "../services/profile.service";

const router: ReturnType<typeof Router> = Router();

router.get("/me", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const profile = await profileService.getProfile(user.id);

        if (!profile) {
            res.status(404).json({ error: "Profile not found" });
            return;
        }

        res.json(profile);
    } catch (err) {
        console.error("GET /profile/me error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.patch("/me", async (req, res: Response) => {
    try {
        const { user } = req as unknown as AuthenticatedRequest;
        const { name, phone, image } = req.body ?? {};

        const updated = await profileService.updateProfile(user.id, {
            name: typeof name === "string" ? name : undefined,
            phone:
                typeof phone === "string" || phone === null
                    ? phone
                    : undefined,
            image:
                typeof image === "string" || image === null
                    ? image
                    : undefined,
        });

        if (!updated) {
            res.status(404).json({ error: "Profile not found" });
            return;
        }

        res.json(updated);
    } catch (err) {
        console.error("PATCH /profile/me error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
