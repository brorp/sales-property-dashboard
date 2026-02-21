import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";

export function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
    }
    next();
}
