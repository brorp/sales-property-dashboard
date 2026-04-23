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

    const conditions: Array<any> = [];

    if (scope?.clientId) {
        conditions.push(eq(lead.clientId, scope.clientId));
    }

    if (role === "client_admin") {
        return conditions.length > 0 ? and(...conditions) : undefined;
    }

    if (role === "supervisor") {
        if (scope?.managedSalesIds?.length) {
            conditions.push(inArray(lead.assignedTo, scope.managedSalesIds));
            return and(...conditions);
        }
        conditions.push(eq(lead.assignedTo, "__none__"));
        return and(...conditions);
    }

    conditions.push(eq(lead.assignedTo, userId));
    return and(...conditions);
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
