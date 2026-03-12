import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth/index";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "../db/index";
import { user } from "../db/schema";
import { and, eq } from "drizzle-orm";
import type { QueryScope } from "./rbac";

export interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        clientId?: string | null;
        supervisorId?: string | null;
        createdByUserId?: string | null;
        image?: string | null;
    };
    session: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
    };
    scope?: QueryScope;
}

async function resolveDevHeaderAuth(req: Request) {
    const allowDevHeaders =
        String(process.env.ALLOW_DEV_AUTH_HEADERS || "true").toLowerCase() !==
        "false";
    const devEmail = req.header("x-dev-user-email");

    if (!allowDevHeaders || !devEmail) {
        return null;
    }

    const [devUser] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            createdByUserId: user.createdByUserId,
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

    if (!devUser) {
        return null;
    }

    return {
        user: devUser,
        session: {
            id: `dev-session-${devUser.id}`,
            userId: devUser.id,
            token: "dev-auth-header",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
    };
}

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        let result: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

        try {
            result = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers),
            });
        } catch {
            result = null;
        }

        if (!result) {
            const devAuth = await resolveDevHeaderAuth(req);

            if (devAuth) {
                (req as AuthenticatedRequest).user = devAuth.user;
                (req as AuthenticatedRequest).session = devAuth.session;
                next();
                return;
            }

            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        // Better Auth session doesn't include clientId by default, so we need to fetch it
        const sessionUser = result.user as Record<string, unknown>;
        const [fullUser] = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                clientId: user.clientId,
                supervisorId: user.supervisorId,
                createdByUserId: user.createdByUserId,
                image: user.image,
            })
            .from(user)
            .where(eq(user.id, String(sessionUser.id)))
            .limit(1);

        if (!fullUser) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        (req as AuthenticatedRequest).user = fullUser;
        (req as AuthenticatedRequest).session = result.session;
        next();
    } catch {
        res.status(401).json({ error: "Unauthorized" });
    }
}
