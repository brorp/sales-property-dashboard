import { db } from "../db";
import { user, lead } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export async function getProfile(userId: string) {
    const [userData] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    if (!userData) return null;

    const rows = await db
        .select({
            progress: lead.progress,
            clientStatus: lead.clientStatus,
            count: sql<number>`count(*)::int`,
        })
        .from(lead)
        .where(
            userData.role === "admin"
                ? undefined
                : eq(lead.assignedTo, userId)
        )
        .groupBy(lead.progress, lead.clientStatus);

    let total = 0;
    let closed = 0;
    let hot = 0;

    for (const row of rows) {
        total += row.count;
        if (row.progress === "closed") closed += row.count;
        if (row.clientStatus === "hot") hot += row.count;
    }

    return {
        ...userData,
        stats: { total, closed, hot },
    };
}
