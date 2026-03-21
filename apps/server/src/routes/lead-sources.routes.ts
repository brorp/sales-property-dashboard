import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import * as leadSourcesService from "../services/lead-sources.service";

const router: ReturnType<typeof Router> = Router();

function resolveClientIdFromRequest(
    req: AuthenticatedRequest,
    rawClientId: unknown
) {
    if (req.user.role === "root_admin") {
        return typeof rawClientId === "string" && rawClientId.trim() ? rawClientId : null;
    }

    return req.user.clientId || null;
}

router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
        const requestUser = req as unknown as AuthenticatedRequest;
        const clientId = resolveClientIdFromRequest(requestUser, req.query.clientId);

        const rows = await leadSourcesService.listLeadSources(clientId);
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (_req, res: Response) => {
    res.status(403).json({
        error: "LEAD_SOURCES_FIXED",
        message: "Source lead sekarang fixed dan tidak bisa ditambah manual.",
    });
});

router.patch("/:id", async (_req, res: Response) => {
    res.status(403).json({
        error: "LEAD_SOURCES_FIXED",
        message: "Source lead sekarang fixed dan tidak bisa diubah manual.",
    });
});

router.delete("/:id", async (_req, res: Response) => {
    res.status(403).json({
        error: "LEAD_SOURCES_FIXED",
        message: "Source lead sekarang fixed dan tidak bisa dihapus manual.",
    });
});

export default router;
