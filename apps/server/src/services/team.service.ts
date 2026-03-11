import { db } from "../db/index";
import { user, lead } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { QueryScope } from "../middleware/rbac";

export async function getTeamWithStats(scope?: QueryScope) {
    // Determine which sales users to show based on scope
    let salesConditions: any[] = [eq(user.role, "sales")];

    if (scope) {
        if (scope.role === "root_admin") {
            // root_admin: all sales users globally
        } else if (scope.role === "client_admin" && scope.clientId) {
            // client_admin: sales users in same client
            salesConditions.push(eq(user.clientId, scope.clientId));
        } else if (scope.role === "supervisor" && scope.managedSalesIds.length > 0) {
            // supervisor: only their managed sales
            salesConditions = [inArray(user.id, scope.managedSalesIds)];
        } else {
            // sales: no team view (return empty)
            return [];
        }
    }

    const salesUsers = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
        })
        .from(user)
        .where(and(...salesConditions));

    const result = [];

    for (const s of salesUsers) {
        const leads = await db
            .select({
                flowStatus: lead.flowStatus,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
            })
            .from(lead)
            .where(eq(lead.assignedTo, s.id));

        const total = leads.length;
        const closed = leads.filter((item) => item.resultStatus === "closing").length;
        const hot = leads.filter((item) => item.salesStatus === "hot").length;
        const pending = leads.filter(
            (item) => item.flowStatus === "open" || item.resultStatus === "menunggu" || !item.resultStatus
        ).length;

        result.push({
            ...s,
            total,
            closed,
            hot,
            pending,
            closeRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        });
    }

    return result;
}
