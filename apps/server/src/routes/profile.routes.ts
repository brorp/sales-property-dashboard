import { Router } from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as profileService from "../services/profile.service";

const router = Router();

router.get("/me", async (req, res: Response) => {
    try {
        const { user } = req as AuthenticatedRequest;
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

export default router;
