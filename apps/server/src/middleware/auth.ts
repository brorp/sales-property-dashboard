import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "../db";
import { user } from "../db/schema";
import { and, eq } from "drizzle-orm";

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
            const allowDevHeaders =
                String(process.env.ALLOW_DEV_AUTH_HEADERS || "true").toLowerCase() !==
                "false";
            const devEmail = req.header("x-dev-user-email");

            if (allowDevHeaders && devEmail) {
                const [devUser] = await db
                    .select({
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        image: user.image,
                    })
                    .from(user)
                    .where(
                        and(
                            eq(user.email, devEmail),
                            eq(user.isActive, true)
                        )
                    )
                    .limit(1);

                if (devUser) {
                    (req as AuthenticatedRequest).user = devUser;
                    (req as AuthenticatedRequest).session = {
                        id: `dev-session-${devUser.id}`,
                        userId: devUser.id,
                        token: "dev-auth-header",
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    };
                    next();
                    return;
                }
            }

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
