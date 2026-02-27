import { db } from "../db";
import { user, lead } from "../db/schema";
import { eq } from "drizzle-orm";

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
