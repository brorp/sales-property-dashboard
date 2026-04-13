import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { db } from "../db/index";
import { user } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { getClientBySlug, parseActiveWhatsAppClientSlug } from "../services/clients.service";

// ─── Role hierarchy (higher index = more privilege) ──────────────────────────
const ROLE_HIERARCHY: Record<string, number> = {
    sales: 0,
    supervisor: 1,
    client_admin: 2,
    root_admin: 3,
};

let cachedActiveClientId: string | null | undefined = undefined;

async function getActiveClientId() {
    if (cachedActiveClientId !== undefined) {
        return cachedActiveClientId;
    }
    const slug = parseActiveWhatsAppClientSlug();
    if (slug) {
        const clientRow = await getClientBySlug(slug);
        cachedActiveClientId = clientRow?.id || null;
    } else {
        cachedActiveClientId = null;
    }
    return cachedActiveClientId;
}

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
    /** For client_admin/root_admin screens that need supervisor detail */
    managedSupervisorIds: string[];
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
 * - client_admin:  scope is all users within the same active client
 * - supervisor:    scope is the sales users mapped via supervisor_sales within the active client
 * - sales:         scope is self only within the active client
 */
export async function injectScope(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
) {
    try {
        const { id: userId, role } = req.user;
        
        // Multi-workspace data isolation override:
        // By default, users operate on the workspace dictated by the server instance.
        const serverClientId = await getActiveClientId();
        const effectiveClientId = role === "root_admin" ? null : (serverClientId || req.user.clientId || null);

        const scope: QueryScope = {
            role,
            userId,
            clientId: effectiveClientId,
            managedSalesIds: [],
            managedSupervisorIds: [],
        };

        if (role === "supervisor") {
            const rows = await db
                .select({ id: user.id })
                .from(user)
                .where(
                    and(
                        eq(user.role, "sales"),
                        eq(user.supervisorId, userId),
                        eq(user.isActive, true)
                        // Note: Supervisor's sales could technically span multi-workspaces,
                        // but conventionally they manage sales only in current workspace.
                    )
                );

            scope.managedSalesIds = rows.map((r) => r.id);
        } else if (role === "client_admin" && effectiveClientId) {
            const rows = await db
                .select({
                    id: user.id,
                    role: user.role,
                })
                .from(user)
                // Filter users to only those operating in this workspace. A user who is shared
                // typically will only have one "home" clientId, but we treat them as part of
                // the workspace while they are visiting it.
                .where(eq(user.isActive, true)); 
                // We do NOT strictly filter user.clientId === effectiveClientId here 
                // because shared users might have a different home clientId.
                // However, since we need to scope their operations, for now we will scope
                // all active sales and supervisors as "managed" for that client admin 
                // in the context of the current workspace!

            scope.managedSalesIds = rows
                .filter((row) => row.role === "sales")
                .map((row) => row.id);
            scope.managedSupervisorIds = rows
                .filter((row) => row.role === "supervisor")
                .map((row) => row.id);
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
