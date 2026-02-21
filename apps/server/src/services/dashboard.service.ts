import { db } from "../db";
import { lead, activity, appointment, user } from "../db/schema";
import { eq, and, desc, sql, ne, lt } from "drizzle-orm";

export async function getStats(userId: string, role: string) {
    const condition =
        role === "admin" ? undefined : eq(lead.assignedTo, userId);

    const rows = await db
        .select({
            clientStatus: lead.clientStatus,
            progress: lead.progress,
            count: sql<number>`count(*)::int`,
        })
        .from(lead)
        .where(condition)
        .groupBy(lead.clientStatus, lead.progress);

    const stats = {
        total: 0,
        hot: 0,
        warm: 0,
        cold: 0,
        closed: 0,
        pending: 0,
        followUp: 0,
        appointment: 0,
        new: 0,
    };

    for (const row of rows) {
        stats.total += row.count;
        if (row.clientStatus === "hot") stats.hot += row.count;
        if (row.clientStatus === "warm") stats.warm += row.count;
        if (row.clientStatus === "cold") stats.cold += row.count;
        if (row.progress === "closed") stats.closed += row.count;
        if (row.progress === "pending") stats.pending += row.count;
        if (row.progress === "follow-up") stats.followUp += row.count;
        if (row.progress === "appointment") stats.appointment += row.count;
        if (row.progress === "new") stats.new += row.count;
    }

    return stats;
}

export async function getTodayAppointments(
    userId: string,
    role: string
) {
    const today = new Date().toISOString().split("T")[0];
    const conditions = [eq(appointment.date, today)];

    if (role !== "admin") {
        conditions.push(eq(lead.assignedTo, userId));
    }

    return db
        .select({
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            appointmentId: appointment.id,
            date: appointment.date,
            time: appointment.time,
            location: appointment.location,
            notes: appointment.notes,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .where(and(...conditions))
        .orderBy(appointment.time);
}

export async function getNeedsFollowup(userId: string, role: string) {
    const oneDayAgo = new Date(Date.now() - 86400000);

    const conditions: ReturnType<typeof eq>[] = [];
    if (role !== "admin") {
        conditions.push(eq(lead.assignedTo, userId));
    }
    conditions.push(ne(lead.progress, "closed"));
    conditions.push(ne(lead.progress, "rejected"));

    const leads = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            clientStatus: lead.clientStatus,
            progress: lead.progress,
            assignedTo: lead.assignedTo,
            createdAt: lead.createdAt,
            assignedUserName: user.name,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(and(...conditions))
        .orderBy(desc(lead.createdAt));

    // Filter leads that are new OR have last activity older than 24h
    const result = [];
    for (const l of leads) {
        if (l.progress === "new") {
            result.push(l);
            continue;
        }

        const [lastActivity] = await db
            .select({ timestamp: activity.timestamp })
            .from(activity)
            .where(eq(activity.leadId, l.id))
            .orderBy(desc(activity.timestamp))
            .limit(1);

        if (!lastActivity || lastActivity.timestamp < oneDayAgo) {
            result.push(l);
        }

        if (result.length >= 5) break;
    }

    return result;
}

export async function getRecentLeads(userId: string, role: string) {
    const condition =
        role === "admin" ? undefined : eq(lead.assignedTo, userId);

    return db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            clientStatus: lead.clientStatus,
            progress: lead.progress,
            assignedTo: lead.assignedTo,
            createdAt: lead.createdAt,
            assignedUserName: user.name,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(condition)
        .orderBy(desc(lead.createdAt))
        .limit(5);
}

export async function getSalesPerformance() {
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
            if (row.progress === "pending" || row.progress === "new")
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

    return result.sort((a, b) => b.closed - a.closed);
}
