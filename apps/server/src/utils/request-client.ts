import type { AuthenticatedRequest } from "../middleware/auth";

function normalizeClientId(rawClientId: unknown) {
    return typeof rawClientId === "string" && rawClientId.trim() ? rawClientId.trim() : null;
}

export function getWorkspaceClientId(req: AuthenticatedRequest) {
    return req.scope?.clientId || req.user.clientId || null;
}

export function getScopeClientId(req: AuthenticatedRequest) {
    return req.scope?.clientId || null;
}

export function resolveClientIdFromWorkspace(
    req: AuthenticatedRequest,
    rawClientId?: unknown
) {
    const explicitClientId = normalizeClientId(rawClientId);
    const workspaceClientId = getWorkspaceClientId(req);

    if (req.user.role === "root_admin") {
        return explicitClientId || workspaceClientId || null;
    }

    return workspaceClientId || explicitClientId || null;
}
