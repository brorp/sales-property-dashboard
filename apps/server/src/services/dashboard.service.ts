import { db } from "../db";
import { lead, activity, appointment, user } from "../db/schema";
import { eq, and, desc, sql, ne, isNotNull } from "drizzle-orm";

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
        prospecting: 0,
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
        if (row.progress === "prospecting") stats.prospecting += row.count;
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
    conditions.push(ne(lead.progress, "no-action"));

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

    return result.sort((a, b) => b.closed - a.closed);
}

const LAYER2_LABELS: Record<string, string> = {
    prospecting: "Prospecting",
    sudah_survey: "Sudah Survey",
    mau_survey: "Mau Survey",
    closing: "Closing",
    rejected: "Rejected",
};

const REJECTED_REASON_LABELS: Record<string, string> = {
    harga: "Harga",
    lokasi: "Lokasi",
    kompetitor: "Pilih Kompetitor",
    belum_siap: "Belum Siap Beli",
    tidak_responsif: "Tidak Responsif",
    tidak_cocok: "Produk Tidak Cocok",
    lainnya: "Lainnya",
};

export async function getLayer2StatusChart(userId: string, role: string) {
    const condition = role === "admin" ? undefined : eq(lead.assignedTo, userId);

    const rows = await db
        .select({
            key: lead.layer2Status,
            count: sql<number>`count(*)::int`,
        })
        .from(lead)
        .where(condition)
        .groupBy(lead.layer2Status);

    const total = rows.reduce((acc, row) => acc + row.count, 0);
    const keys = ["prospecting", "sudah_survey", "mau_survey", "closing", "rejected"];
    const countByKey = new Map(rows.map((row) => [row.key, row.count]));

    return {
        total,
        items: keys.map((key) => {
            const count = countByKey.get(key) || 0;
            return {
                key,
                label: LAYER2_LABELS[key] || key,
                count,
                percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
            };
        }),
    };
}

export async function getRejectedReasonChart(userId: string, role: string) {
    const conditions = [eq(lead.layer2Status, "rejected"), isNotNull(lead.rejectedReason)];
    if (role !== "admin") {
        conditions.push(eq(lead.assignedTo, userId));
    }

    const rows = await db
        .select({
            key: lead.rejectedReason,
            count: sql<number>`count(*)::int`,
        })
        .from(lead)
        .where(and(...conditions))
        .groupBy(lead.rejectedReason);

    const total = rows.reduce((acc, row) => acc + row.count, 0);

    return {
        total,
        items: rows
            .map((row) => {
                const key = row.key || "lainnya";
                return {
                    key,
                    label: REJECTED_REASON_LABELS[key] || key,
                    count: row.count,
                    percentage: total > 0 ? Math.round((row.count / total) * 10000) / 100 : 0,
                };
            })
            .sort((a, b) => b.count - a.count),
    };
}
