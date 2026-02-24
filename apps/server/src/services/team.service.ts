import { db } from "../db";
import { user, lead } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export async function getTeamWithStats() {
    const salesUsers = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
        })
        .from(user)
        .where(eq(user.role, "sales"));

    const result = [];

    for (const s of salesUsers) {
        const rows = await db
            .select({
                progress: lead.progress,
                clientStatus: lead.clientStatus,
                count: sql<number>`count(*)::int`,
            })
            .from(lead)
            .where(eq(lead.assignedTo, s.id))
            .groupBy(lead.progress, lead.clientStatus);

        let total = 0;
        let closed = 0;
        let hot = 0;
        let pending = 0;

        for (const row of rows) {
            total += row.count;
            if (row.progress === "closed") closed += row.count;
            if (row.clientStatus === "hot") hot += row.count;
            if (
                row.progress === "pending" ||
                row.progress === "new" ||
                row.progress === "prospecting"
            )
                pending += row.count;
        }

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
