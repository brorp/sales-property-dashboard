import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { db } from "../db/index";
import { supervisorSales, user } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

// ─── Role hierarchy (higher index = more privilege) ──────────────────────────
const ROLE_HIERARCHY: Record<string, number> = {
    sales: 0,
    supervisor: 1,
    client_admin: 2,
    root_admin: 3,
};

/**
 * Scope object attached to `req.scope` by `injectScope` middleware.
 * All service functions should use this to filter data.
 */
export interface QueryScope {
    role: string;
    userId: string;
    clientId: string | null;
    /** For supervisor: IDs of sales users under them */
    managedSalesIds: string[];
}

/**
 * Middleware: require the user to have one of the specified roles.
 * Usage: `router.get("/...", requireRole("root_admin", "client_admin"), handler)`
 */
export function requireRole(...roles: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.role;
        if (!userRole || !roles.includes(userRole)) {
            res.status(403).json({
                error: "FORBIDDEN",
                message: `Akses ditolak. Role yang diizinkan: ${roles.join(", ")}`,
            });
            return;
        }
        next();
    };
}

/**
 * Middleware: require the user to have at least the specified role level.
 * e.g. `requireMinRole("supervisor")` allows supervisor, client_admin, root_admin
 */
export function requireMinRole(minRole: string) {
    const minLevel = ROLE_HIERARCHY[minRole] ?? 999;

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.role;
        const userLevel = ROLE_HIERARCHY[userRole || ""] ?? -1;

        if (userLevel < minLevel) {
            res.status(403).json({
                error: "FORBIDDEN",
                message: `Akses ditolak. Minimal role: ${minRole}`,
            });
            return;
        }
        next();
    };
}

/**
 * Legacy alias — kept for backward compatibility during migration.
 */
export function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const role = req.user?.role;
    if (role !== "client_admin" && role !== "root_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
    }
    next();
}

/**
 * Middleware: injects a QueryScope onto `req.scope` based on the user's role.
 * Must be used AFTER `requireAuth`.
 *
 * - root_admin:    scope is global (clientId = null)
 * - client_admin:  scope is all users within the same client
 * - supervisor:    scope is the sales users mapped via supervisor_sales
 * - sales:         scope is self only
 */
export async function injectScope(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
) {
    try {
        const { id: userId, role, clientId } = req.user;

        const scope: QueryScope = {
            role,
            userId,
            clientId: clientId ?? null,
            managedSalesIds: [],
        };

        if (role === "supervisor") {
            // Get sales IDs under this supervisor
            const rows = await db
                .select({ salesId: supervisorSales.salesId })
                .from(supervisorSales)
                .where(eq(supervisorSales.supervisorId, userId));

            scope.managedSalesIds = rows.map((r) => r.salesId);
        } else if (role === "client_admin" && clientId) {
            // Get all sales + supervisor IDs in the same client
            const rows = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.clientId, clientId));

            scope.managedSalesIds = rows.map((r) => r.id);
        }

        req.scope = scope;
        next();
    } catch (error) {
        next(error);
    }
}

/**
 * Helper: get lead IDs visible to the scope.
 * Returns a Drizzle `where` clause condition based on role.
 */
export function getRoleLevel(role: string): number {
    return ROLE_HIERARCHY[role] ?? -1;
}
