import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
    activity,
    appointment,
    distributionAttempt,
    distributionCycle,
    lead,
    leadProgressHistory,
    leadStatusHistory,
    user,
    waMessage,
} from "../db/schema";

type UnifiedActivityLog = {
    id: string;
    source: string;
    eventType: string;
    message: string;
    leadId: string | null;
    leadName: string | null;
    salesId: string | null;
    salesName: string | null;
    timestamp: Date;
};

function sortDescByTime(a: UnifiedActivityLog, b: UnifiedActivityLog) {
    return b.timestamp.getTime() - a.timestamp.getTime();
}

export async function getUnifiedActivityLogs(limitInput?: number) {
    const limit = Number.isFinite(limitInput)
        ? Math.max(20, Math.min(Number(limitInput), 1000))
        : 300;

    const [activityRows, waRows, attemptRows, cycleRows, appointmentRows, statusRows, progressRows] =
        await Promise.all([
            db
                .select({
                    id: activity.id,
                    type: activity.type,
                    note: activity.note,
                    timestamp: activity.timestamp,
                    leadId: activity.leadId,
                    leadName: lead.name,
                })
                .from(activity)
                .leftJoin(lead, eq(activity.leadId, lead.id))
                .orderBy(desc(activity.timestamp))
                .limit(limit),
            db
                .select({
                    id: waMessage.id,
                    direction: waMessage.direction,
                    body: waMessage.body,
                    timestamp: waMessage.createdAt,
                    leadId: waMessage.leadId,
                    leadName: lead.name,
                    salesId: waMessage.salesId,
                    salesName: user.name,
                    fromWa: waMessage.fromWa,
                    toWa: waMessage.toWa,
                })
                .from(waMessage)
                .leftJoin(lead, eq(waMessage.leadId, lead.id))
                .leftJoin(user, eq(waMessage.salesId, user.id))
                .orderBy(desc(waMessage.createdAt))
                .limit(limit),
            db
                .select({
                    id: distributionAttempt.id,
                    status: distributionAttempt.status,
                    closeReason: distributionAttempt.closeReason,
                    queueOrder: distributionAttempt.queueOrder,
                    timestamp: distributionAttempt.assignedAt,
                    leadId: distributionAttempt.leadId,
                    leadName: lead.name,
                    salesId: distributionAttempt.salesId,
                    salesName: user.name,
                })
                .from(distributionAttempt)
                .leftJoin(lead, eq(distributionAttempt.leadId, lead.id))
                .leftJoin(user, eq(distributionAttempt.salesId, user.id))
                .orderBy(desc(distributionAttempt.assignedAt))
                .limit(limit),
            db
                .select({
                    id: distributionCycle.id,
                    status: distributionCycle.status,
                    currentQueueOrder: distributionCycle.currentQueueOrder,
                    startedAt: distributionCycle.startedAt,
                    finishedAt: distributionCycle.finishedAt,
                    leadId: distributionCycle.leadId,
                    leadName: lead.name,
                })
                .from(distributionCycle)
                .leftJoin(lead, eq(distributionCycle.leadId, lead.id))
                .orderBy(desc(distributionCycle.startedAt))
                .limit(limit),
            db
                .select({
                    id: appointment.id,
                    leadId: appointment.leadId,
                    leadName: lead.name,
                    salesId: appointment.salesId,
                    salesName: user.name,
                    date: appointment.date,
                    time: appointment.time,
                    location: appointment.location,
                    notes: appointment.notes,
                    timestamp: appointment.createdAt,
                })
                .from(appointment)
                .leftJoin(lead, eq(appointment.leadId, lead.id))
                .leftJoin(user, eq(appointment.salesId, user.id))
                .orderBy(desc(appointment.createdAt))
                .limit(limit),
            db
                .select({
                    id: leadStatusHistory.id,
                    oldStatus: leadStatusHistory.oldStatus,
                    newStatus: leadStatusHistory.newStatus,
                    note: leadStatusHistory.note,
                    timestamp: leadStatusHistory.changedAt,
                    leadId: leadStatusHistory.leadId,
                    leadName: lead.name,
                    salesId: leadStatusHistory.changedBy,
                    salesName: user.name,
                })
                .from(leadStatusHistory)
                .leftJoin(lead, eq(leadStatusHistory.leadId, lead.id))
                .leftJoin(user, eq(leadStatusHistory.changedBy, user.id))
                .orderBy(desc(leadStatusHistory.changedAt))
                .limit(limit),
            db
                .select({
                    id: leadProgressHistory.id,
                    oldProgress: leadProgressHistory.oldProgress,
                    newProgress: leadProgressHistory.newProgress,
                    note: leadProgressHistory.note,
                    timestamp: leadProgressHistory.changedAt,
                    leadId: leadProgressHistory.leadId,
                    leadName: lead.name,
                    salesId: leadProgressHistory.changedBy,
                    salesName: user.name,
                })
                .from(leadProgressHistory)
                .leftJoin(lead, eq(leadProgressHistory.leadId, lead.id))
                .leftJoin(user, eq(leadProgressHistory.changedBy, user.id))
                .orderBy(desc(leadProgressHistory.changedAt))
                .limit(limit),
        ]);

    const normalized: UnifiedActivityLog[] = [
        ...activityRows.map((row) => ({
            id: `activity:${row.id}`,
            source: "activity",
            eventType: row.type || "note",
            message: row.note,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: null,
            salesName: null,
            timestamp: row.timestamp,
        })),
        ...waRows.map((row) => ({
            id: `wa_message:${row.id}`,
            source: "wa_message",
            eventType: row.direction,
            message: `${row.fromWa} -> ${row.toWa}: ${row.body}`,
            leadId: row.leadId || null,
            leadName: row.leadName || null,
            salesId: row.salesId || null,
            salesName: row.salesName || null,
            timestamp: row.timestamp,
        })),
        ...attemptRows.map((row) => ({
            id: `distribution_attempt:${row.id}`,
            source: "distribution_attempt",
            eventType: row.status,
            message: `Queue #${row.queueOrder} status ${row.status}${row.closeReason ? ` (${row.closeReason})` : ""}`,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: row.salesId,
            salesName: row.salesName || null,
            timestamp: row.timestamp,
        })),
        ...cycleRows.map((row) => ({
            id: `distribution_cycle:${row.id}`,
            source: "distribution_cycle",
            eventType: row.status,
            message: `Cycle status ${row.status}, queue ${row.currentQueueOrder}`,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: null,
            salesName: null,
            timestamp: row.finishedAt || row.startedAt,
        })),
        ...appointmentRows.map((row) => ({
            id: `appointment:${row.id}`,
            source: "appointment",
            eventType: "created",
            message: `Appointment ${row.date} ${row.time} @ ${row.location}${row.notes ? ` (${row.notes})` : ""}`,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: row.salesId || null,
            salesName: row.salesName || null,
            timestamp: row.timestamp,
        })),
        ...statusRows.map((row) => ({
            id: `lead_status_history:${row.id}`,
            source: "lead_status_history",
            eventType: "status_changed",
            message: `Status ${row.oldStatus || "-"} -> ${row.newStatus}${row.note ? ` (${row.note})` : ""}`,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: row.salesId || null,
            salesName: row.salesName || null,
            timestamp: row.timestamp,
        })),
        ...progressRows.map((row) => ({
            id: `lead_progress_history:${row.id}`,
            source: "lead_progress_history",
            eventType: "progress_changed",
            message: `Progress ${row.oldProgress || "-"} -> ${row.newProgress}${row.note ? ` (${row.note})` : ""}`,
            leadId: row.leadId,
            leadName: row.leadName || null,
            salesId: row.salesId || null,
            salesName: row.salesName || null,
            timestamp: row.timestamp,
        })),
    ];

    return normalized.sort(sortDescByTime).slice(0, limit);
}
