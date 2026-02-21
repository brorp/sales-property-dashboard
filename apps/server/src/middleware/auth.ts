import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth";
import { fromNodeHeaders } from "better-auth/node";

export interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        image?: string | null;
    };
    session: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
    };
}

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const result = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!result) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        (req as AuthenticatedRequest).user = result.user as AuthenticatedRequest["user"];
        (req as AuthenticatedRequest).session = result.session;
        next();
    } catch {
        res.status(401).json({ error: "Unauthorized" });
    }
}
