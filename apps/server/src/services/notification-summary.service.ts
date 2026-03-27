import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { lead } from "../db/schema";
import type { QueryScope } from "../middleware/rbac";
import { getUnifiedActivityLogs } from "./activity-logs.service";

function buildLeadScopeCondition(
    userId: string,
    role: string,
    scope?: QueryScope
) {
    if (role === "root_admin") {
        return undefined;
    }

    if (role === "client_admin" && scope?.clientId) {
        return eq(lead.clientId, scope.clientId);
    }

    if (role === "supervisor") {
        if (scope?.managedSalesIds?.length) {
            return inArray(lead.assignedTo, scope.managedSalesIds);
        }
        return eq(lead.assignedTo, "__none__");
    }

    return eq(lead.assignedTo, userId);
}

export async function getNotificationSummary(
    userId: string,
    role: string,
    scope?: QueryScope
) {
    const [latestLeadRow, latestLogRows] = await Promise.all([
        db
            .select({
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
            })
            .from(lead)
            .where(buildLeadScopeCondition(userId, role, scope))
            .orderBy(desc(lead.createdAt), desc(lead.updatedAt))
            .limit(1),
        getUnifiedActivityLogs(userId, role, scope, 1),
    ]);

    return {
        latestLeadAt: latestLeadRow[0]?.createdAt?.toISOString() || null,
        latestLogAt: latestLogRows[0]?.timestamp?.toISOString() || null,
    };
}
