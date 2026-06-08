import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "../db/index";
import { activity, appointment, dailyTask, lead, user } from "../db/schema";
import {
    resolveAppointmentTag,
    toAppointmentDateTime,
    type AppointmentTag,
} from "../utils/appointment";
import { generateId } from "../utils/id";
import {
    DAILY_TASK_FOLLOWUP_MILESTONE_DAYS,
    DAILY_TASK_FOLLOWUP_STAGE_COUNT,
    getAllowedNewLeadTaskSalesStatuses,
    getFlowStatusLabel,
    getSalesStatusLabel,
    normalizeDailyTaskStatus,
    normalizeFlowStatus,
    normalizeSalesStatus,
    canSubmitNewLeadTaskSalesStatus,
    SKIP_AUTO_CANCEL_NOTE,
    SKIP_AUTO_CANCEL_REASON,
    SKIP_AUTO_RESULT_STATUS,
} from "../utils/lead-workflow";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const DAY_MS = 24 * 60 * 60 * 1000;
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEADLINE_LEAD_TARGET_AGE_DAYS = 14;

type LeadTaskScope = {
    id: string;
    name: string;
    phone: string;
    source: string;
    clientId: string | null;
    assignedTo: string | null;
    flowStatus: string;
    acceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    salesStatus: string | null;
    resultStatus: string | null;
};

function addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getJakartaDayIndex(value: Date) {
    const shifted = new Date(value.getTime() + JAKARTA_OFFSET_MS);
    return Math.floor(
        Date.UTC(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth(),
            shifted.getUTCDate()
        ) / DAY_MS
    );
}

function getJakartaCalendarAgeDays(value: Date, now: Date) {
    return getJakartaDayIndex(now) - getJakartaDayIndex(value);
}

function pickLatestAppointment<T extends { date: string; time: string }>(items: T[]) {
    if (items.length === 0) {
        return null;
    }

    let latest = items[0];
    let latestTime = toAppointmentDateTime(items[0].date, items[0].time).getTime();

    for (let index = 1; index < items.length; index += 1) {
        const next = items[index];
        const nextTime = toAppointmentDateTime(next.date, next.time).getTime();
        if (nextTime > latestTime) {
            latest = next;
            latestTime = nextTime;
        }
    }

    return latest;
}

function getFollowUpLabel(stage: number) {
    return `Follow Up ${stage}`;
}

function getTaskTypeLabel(taskType: string, stage = 0) {
    if (taskType === "follow_up") {
        return getFollowUpLabel(stage);
    }
    if (taskType === "deadline_lead") {
        return "Deadline Leads";
    }
    return "New Lead";
}

function isLeadStillEligibleForNewLeadTask(leadRow: LeadTaskScope, salesId: string) {
    const normalizedFlowStatus = normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo);
    return (
        leadRow.assignedTo === salesId &&
        (normalizedFlowStatus === "assigned" || normalizedFlowStatus === "accepted")
    );
}

function isLeadEligibleForFollowUpTask(
    leadRow: LeadTaskScope,
    appointmentTag: AppointmentTag
) {
    const normalizedFlowStatus = normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo);
    const normalizedSalesStatus = normalizeSalesStatus(leadRow.salesStatus);
    return (
        normalizedFlowStatus === "accepted" &&
        Boolean(leadRow.assignedTo) &&
        !leadRow.resultStatus &&
        normalizedSalesStatus !== "skip" &&
        appointmentTag === "none"
    );
}

function isLeadBaseEligibleForDeadlineLeadTask(
    leadRow: LeadTaskScope,
    appointmentTag: AppointmentTag
) {
    const normalizedFlowStatus = normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo);
    const normalizedSalesStatus = normalizeSalesStatus(leadRow.salesStatus);
    return (
        normalizedFlowStatus === "accepted" &&
        Boolean(leadRow.assignedTo) &&
        !leadRow.resultStatus &&
        appointmentTag === "none" &&
        normalizedSalesStatus === "warm"
    );
}

function isLeadEligibleForDeadlineLeadCreation(
    leadRow: LeadTaskScope,
    appointmentTag: AppointmentTag,
    now: Date
) {
    return (
        isLeadBaseEligibleForDeadlineLeadTask(leadRow, appointmentTag) &&
        getJakartaCalendarAgeDays(leadRow.createdAt, now) === DEADLINE_LEAD_TARGET_AGE_DAYS
    );
}

async function getLeadTaskRows(executor: DbExecutor, leadId: string) {
    return executor
        .select()
        .from(dailyTask)
        .where(eq(dailyTask.leadId, leadId))
        .orderBy(asc(dailyTask.followupStage), asc(dailyTask.createdAt));
}

async function getLeadRowsByIds(executor: DbExecutor, leadIds: string[]) {
    if (leadIds.length === 0) {
        return [];
    }

    return executor
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            clientId: lead.clientId,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            acceptedAt: lead.acceptedAt,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
        })
        .from(lead)
        .where(inArray(lead.id, leadIds));
}

async function getLatestAppointmentTagMap(
    executor: DbExecutor,
    leadIds: string[]
): Promise<Map<string, AppointmentTag>> {
    if (leadIds.length === 0) {
        return new Map();
    }

    const rows = await executor
        .select({
            leadId: appointment.leadId,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            location: appointment.location,
            notes: appointment.notes,
            createdAt: appointment.createdAt,
        })
        .from(appointment)
        .where(inArray(appointment.leadId, leadIds));

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
        const list = grouped.get(row.leadId) || [];
        list.push(row);
        grouped.set(row.leadId, list);
    }

    const map = new Map<string, AppointmentTag>();
    for (const leadId of leadIds) {
        const latest = pickLatestAppointment(grouped.get(leadId) || []);
        map.set(leadId, resolveAppointmentTag(latest || null));
    }

    return map;
}

async function upsertDailyTask(params: {
    executor?: DbExecutor;
    leadId: string;
    salesId: string;
    clientId?: string | null;
    taskType: "new_lead" | "follow_up" | "deadline_lead";
    followupStage?: number;
    eligibleAt: Date;
    dueAt: Date;
    now?: Date;
    forceReactivateDone?: boolean;
}) {
    const executor = params.executor || db;
    const now = params.now || new Date();
    const followupStage = params.followupStage ?? 0;

    const [inserted] = await executor
        .insert(dailyTask)
        .values({
            id: generateId(),
            leadId: params.leadId,
            salesId: params.salesId,
            clientId: params.clientId || null,
            taskType: params.taskType,
            followupStage,
            eligibleAt: params.eligibleAt,
            dueAt: params.dueAt,
            status: params.dueAt.getTime() <= now.getTime() ? "overdue" : "pending",
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

    if (inserted) {
        return inserted;
    }

    const [existing] = await executor
        .select()
        .from(dailyTask)
        .where(
            and(
                eq(dailyTask.leadId, params.leadId),
                eq(dailyTask.taskType, params.taskType),
                eq(dailyTask.followupStage, followupStage)
            )
        )
        .limit(1);

    if (!existing) {
        return null;
    }

    if (existing.status === "done" && !params.forceReactivateDone) {
        return existing;
    }

    const shouldReactivate =
        params.forceReactivateDone ||
        existing.status === "invalid" ||
        existing.salesId !== params.salesId ||
        existing.clientId !== (params.clientId || null);

    if (!shouldReactivate) {
        if (
            existing.status === "pending" &&
            params.dueAt.getTime() <= now.getTime()
        ) {
            const [updated] = await executor
                .update(dailyTask)
                .set({
                    status: "overdue",
                    updatedAt: now,
                })
                .where(eq(dailyTask.id, existing.id))
                .returning();
            return updated || existing;
        }

        return existing;
    }

    const [updated] = await executor
        .update(dailyTask)
        .set({
            salesId: params.salesId,
            clientId: params.clientId || null,
            eligibleAt: params.eligibleAt,
            dueAt: params.dueAt,
            completedAt: null,
            status: params.dueAt.getTime() <= now.getTime() ? "overdue" : "pending",
            screenshotUrl: null,
            submittedSalesStatus: null,
            note: null,
            updatedAt: now,
        })
        .where(eq(dailyTask.id, existing.id))
        .returning();

    return updated || existing;
}

async function invalidateTaskIds(
    taskIds: string[],
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    if (taskIds.length === 0) {
        return;
    }

    await executor
        .update(dailyTask)
        .set({
            status: "invalid",
            updatedAt: now,
        })
        .where(inArray(dailyTask.id, taskIds));
}

export async function markOverdueDailyTasks(
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    await executor
        .update(dailyTask)
        .set({
            status: "overdue",
            updatedAt: now,
        })
        .where(
            and(
                eq(dailyTask.status, "pending"),
                lte(dailyTask.dueAt, now)
            )
        );
}

export async function createNewLeadTaskForLead(params: {
    leadId: string;
    salesId: string;
    clientId?: string | null;
    assignedAt?: Date;
    executor?: DbExecutor;
    forceReactivateDone?: boolean;
}) {
    const executor = params.executor || db;
    const assignedAt = params.assignedAt || new Date();

    return upsertDailyTask({
        executor,
        leadId: params.leadId,
        salesId: params.salesId,
        clientId: params.clientId || null,
        taskType: "new_lead",
        followupStage: 0,
        eligibleAt: assignedAt,
        dueAt: addHours(assignedAt, 24),
        now: assignedAt,
        forceReactivateDone: params.forceReactivateDone || false,
    });
}

export async function invalidateDailyTasksForLead(
    leadId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    await executor
        .update(dailyTask)
        .set({
            status: "invalid",
            updatedAt: now,
        })
        .where(
            and(
                eq(dailyTask.leadId, leadId),
                inArray(dailyTask.status, ["pending", "overdue"])
            )
        );
}

export async function invalidateFollowUpTasksForLead(
    leadId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    await executor
        .update(dailyTask)
        .set({
            status: "invalid",
            updatedAt: now,
        })
        .where(
            and(
                eq(dailyTask.leadId, leadId),
                eq(dailyTask.taskType, "follow_up"),
                inArray(dailyTask.status, ["pending", "overdue"])
            )
        );
}

export async function syncLeadDailyTasksForLead(
    leadId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const [leadRow] = await executor
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            clientId: lead.clientId,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            acceptedAt: lead.acceptedAt,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    if (!leadRow) {
        return null;
    }

    const taskRows = await getLeadTaskRows(executor, leadId);
    const appointmentTagMap = await getLatestAppointmentTagMap(executor, [leadId]);
    const appointmentTag = appointmentTagMap.get(leadId) || "none";
    const normalizedFlowStatus = normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo);

    if (
        leadRow.assignedTo &&
        normalizedFlowStatus === "assigned"
    ) {
        await upsertDailyTask({
            executor,
            leadId,
            salesId: leadRow.assignedTo,
            clientId: leadRow.clientId || null,
            taskType: "new_lead",
            followupStage: 0,
            eligibleAt: leadRow.updatedAt || leadRow.createdAt,
            dueAt: addHours(leadRow.updatedAt || leadRow.createdAt, 24),
            now,
        });
    }

    const newLeadTaskIdsToInvalidate = taskRows
        .filter(
            (task) =>
                task.taskType === "new_lead" &&
                ["pending", "overdue"].includes(task.status) &&
                !isLeadStillEligibleForNewLeadTask(leadRow, task.salesId)
        )
        .map((task) => task.id);
    await invalidateTaskIds(newLeadTaskIdsToInvalidate, executor, now);

    const deadlineLeadCreationEligible = isLeadEligibleForDeadlineLeadCreation(
        leadRow,
        appointmentTag,
        now
    );
    const deadlineLeadBaseEligible = isLeadBaseEligibleForDeadlineLeadTask(
        leadRow,
        appointmentTag
    );

    if (leadRow.assignedTo && deadlineLeadCreationEligible) {
        const eligibleAt = addDays(leadRow.createdAt, 14);
        await upsertDailyTask({
            executor,
            leadId,
            salesId: leadRow.assignedTo,
            clientId: leadRow.clientId || null,
            taskType: "deadline_lead",
            followupStage: 0,
            eligibleAt,
            dueAt: eligibleAt,
            now,
        });
    } else if (!deadlineLeadBaseEligible) {
        const deadlineLeadTaskIdsToInvalidate = taskRows
            .filter(
                (task) =>
                    task.taskType === "deadline_lead" &&
                    ["pending", "overdue"].includes(task.status)
            )
            .map((task) => task.id);
        await invalidateTaskIds(deadlineLeadTaskIdsToInvalidate, executor, now);
    }

    const activeFollowUpTasks = taskRows.filter((task) => task.taskType === "follow_up");
    const completedFollowUpCount = activeFollowUpTasks.filter(
        (task) => task.status === "done" && task.followupStage >= 1 && task.followupStage <= 3
    ).length;

    if (!leadRow.assignedTo || !isLeadEligibleForFollowUpTask(leadRow, appointmentTag)) {
        await invalidateFollowUpTasksForLead(leadId, executor, now);
        return {
            leadId,
            appointmentTag,
            completedFollowUpCount,
        };
    }

    const acceptedAt = leadRow.acceptedAt || null;
    if (!acceptedAt) {
        await invalidateFollowUpTasksForLead(leadId, executor, now);
        return {
            leadId,
            appointmentTag,
            completedFollowUpCount,
        };
    }

    for (let index = 0; index < DAILY_TASK_FOLLOWUP_MILESTONE_DAYS.length; index += 1) {
        const stage = index + 1;
        const eligibleAt = addDays(acceptedAt, DAILY_TASK_FOLLOWUP_MILESTONE_DAYS[index]);
        if (eligibleAt.getTime() > now.getTime()) {
            continue;
        }

        await upsertDailyTask({
            executor,
            leadId,
            salesId: leadRow.assignedTo,
            clientId: leadRow.clientId || null,
            taskType: "follow_up",
            followupStage: stage,
            eligibleAt,
            dueAt: addHours(eligibleAt, 24),
            now,
        });
    }

    return {
        leadId,
        appointmentTag,
        completedFollowUpCount,
    };
}

export async function generateFollowUpTasks(
    now: Date = new Date(),
    executor: DbExecutor = db
) {
    const rows = await executor
        .select({
            id: lead.id,
        })
        .from(lead)
        .where(eq(lead.flowStatus, "accepted"));

    let generatedCount = 0;
    for (const row of rows) {
        const beforeRows = await getLeadTaskRows(executor, row.id);
        const beforePendingCount = beforeRows.filter(
            (task) => task.taskType === "follow_up"
        ).length;
        await syncLeadDailyTasksForLead(row.id, executor, now);
        const afterRows = await getLeadTaskRows(executor, row.id);
        const afterPendingCount = afterRows.filter(
            (task) => task.taskType === "follow_up"
        ).length;
        if (afterPendingCount > beforePendingCount) {
            generatedCount += afterPendingCount - beforePendingCount;
        }
    }

    return generatedCount;
}

async function reconcileTaskVisibilityForSales(
    salesId: string,
    clientId?: string | null,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const activeLeadRows = await executor
        .select({
            id: lead.id,
        })
        .from(lead)
        .where(
            and(
                eq(lead.assignedTo, salesId),
                clientId ? eq(lead.clientId, clientId) : undefined
            )
        );

    for (const row of activeLeadRows) {
        await syncLeadDailyTasksForLead(row.id, executor, now);
    }

    const staleTasks = await executor
        .select({
            id: dailyTask.id,
            leadId: dailyTask.leadId,
        })
        .from(dailyTask)
        .leftJoin(lead, eq(dailyTask.leadId, lead.id))
        .where(
            and(
                eq(dailyTask.salesId, salesId),
                clientId ? eq(dailyTask.clientId, clientId) : undefined,
                inArray(dailyTask.status, ["pending", "overdue"])
            )
        );

    const taskLeadIds = Array.from(new Set(staleTasks.map((row) => row.leadId)));
    const leadRows = await getLeadRowsByIds(executor, taskLeadIds);
    const leadMap = new Map(leadRows.map((row) => [row.id, row]));
    const taskIdsToInvalidate: string[] = [];

    for (const task of staleTasks) {
        const leadRow = leadMap.get(task.leadId);
        if (!leadRow || leadRow.assignedTo !== salesId) {
            taskIdsToInvalidate.push(task.id);
        }
    }

    await invalidateTaskIds(taskIdsToInvalidate, executor, now);
}

function buildTaskCardPayload(task: any, leadRow: LeadTaskScope, appointmentTag: AppointmentTag) {
    return {
        id: task.id,
        leadId: leadRow.id,
        leadName: leadRow.name,
        leadPhone: leadRow.phone,
        leadSource: leadRow.source,
        assignedAt: task.eligibleAt,
        acceptedAt: leadRow.acceptedAt,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
        taskType: task.taskType,
        followupStage: task.followupStage,
        status: task.status,
        screenshotUrl: task.screenshotUrl || null,
        submittedSalesStatus: task.submittedSalesStatus || null,
        appointmentTag,
        flowStatus: normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo),
        salesStatus: leadRow.salesStatus,
        resultStatus: leadRow.resultStatus,
        createdAt: leadRow.createdAt,
        updatedAt: leadRow.updatedAt,
        label: getTaskTypeLabel(task.taskType, task.followupStage),
    };
}

export async function getDailyTasksForSales(
    salesId: string,
    clientId?: string | null,
    now: Date = new Date()
) {
    await markOverdueDailyTasks(db, now);
    await reconcileTaskVisibilityForSales(salesId, clientId || null, db, now);

    const rows = await db
        .select({
            id: dailyTask.id,
            leadId: dailyTask.leadId,
            salesId: dailyTask.salesId,
            clientId: dailyTask.clientId,
            taskType: dailyTask.taskType,
            followupStage: dailyTask.followupStage,
            eligibleAt: dailyTask.eligibleAt,
            dueAt: dailyTask.dueAt,
            completedAt: dailyTask.completedAt,
            status: dailyTask.status,
            screenshotUrl: dailyTask.screenshotUrl,
            submittedSalesStatus: dailyTask.submittedSalesStatus,
            note: dailyTask.note,
            createdAt: dailyTask.createdAt,
            updatedAt: dailyTask.updatedAt,
        })
        .from(dailyTask)
        .where(
            and(
                eq(dailyTask.salesId, salesId),
                clientId ? eq(dailyTask.clientId, clientId) : undefined,
                inArray(dailyTask.status, ["pending", "overdue"])
            )
        )
        .orderBy(asc(dailyTask.dueAt), asc(dailyTask.createdAt));

    const leadIds = Array.from(new Set(rows.map((row) => row.leadId)));
    const leadRows = await getLeadRowsByIds(db, leadIds);
    const leadMap = new Map(leadRows.map((row) => [row.id, row]));
    const appointmentTagMap = await getLatestAppointmentTagMap(db, leadIds);

    const newLeads: Array<any> = [];
    const followUps: Array<any> = [];
    const deadlineLeads: Array<any> = [];

    for (const row of rows) {
        const leadRow = leadMap.get(row.leadId);
        if (!leadRow) {
            continue;
        }

        const payload = buildTaskCardPayload(
            row,
            leadRow,
            appointmentTagMap.get(row.leadId) || "none"
        );

        if (row.taskType === "new_lead") {
            newLeads.push(payload);
            continue;
        }

        if (row.taskType === "deadline_lead") {
            deadlineLeads.push(payload);
            continue;
        }

        followUps.push(payload);
    }

    return {
        newLeads,
        followUps,
        deadlineLeads,
        counts: {
            newLeadCount: newLeads.length,
            followUpCount: followUps.length,
            deadlineLeadCount: deadlineLeads.length,
            totalCount: newLeads.length + followUps.length + deadlineLeads.length,
        },
    };
}

export async function getDailyTaskCounts(
    salesId: string,
    clientId?: string | null,
    now: Date = new Date()
) {
    const data = await getDailyTasksForSales(salesId, clientId, now);
    return data.counts;
}

async function getTaskForSalesAction(
    taskId: string,
    salesId: string,
    taskType: "new_lead" | "follow_up" | "deadline_lead",
    executor: DbExecutor = db
) {
    const [taskRow] = await executor
        .select()
        .from(dailyTask)
        .where(eq(dailyTask.id, taskId))
        .limit(1);

    if (!taskRow) {
        throw new Error("DAILY_TASK_NOT_FOUND");
    }

    if (taskRow.salesId !== salesId) {
        throw new Error("FORBIDDEN_DAILY_TASK");
    }

    if (taskRow.taskType !== taskType) {
        throw new Error("DAILY_TASK_TYPE_MISMATCH");
    }

    if (!["pending", "overdue"].includes(taskRow.status)) {
        throw new Error("DAILY_TASK_NOT_ACTIONABLE");
    }

    return taskRow;
}

export async function submitNewLeadTask(params: {
    taskId: string;
    actorId: string;
    actorName: string;
    screenshotUrl: string;
    salesStatus: string;
}) {
    if (!params.screenshotUrl) {
        throw new Error("DAILY_TASK_SCREENSHOT_REQUIRED");
    }

    return db.transaction(async (tx) => {
        const taskRow = await getTaskForSalesAction(params.taskId, params.actorId, "new_lead", tx);
        const [leadRow] = await tx
            .select()
            .from(lead)
            .where(eq(lead.id, taskRow.leadId))
            .limit(1);

        if (!leadRow) {
            throw new Error("LEAD_NOT_FOUND");
        }

        if (!canSubmitNewLeadTaskSalesStatus(params.salesStatus, leadRow.createdAt)) {
            throw new Error("DAILY_TASK_INVALID_SALES_STATUS");
        }

        if (!isLeadStillEligibleForNewLeadTask(leadRow as LeadTaskScope, params.actorId)) {
            await invalidateTaskIds([taskRow.id], tx, new Date());
            throw new Error("DAILY_TASK_NO_LONGER_ELIGIBLE");
        }

        const nextSalesStatus = normalizeSalesStatus(params.salesStatus);
        if (!nextSalesStatus) {
            throw new Error("DAILY_TASK_INVALID_SALES_STATUS");
        }

        const now = new Date();
        const normalizedFlowStatus = normalizeFlowStatus(leadRow.flowStatus, leadRow.assignedTo);
        const nextAcceptedAt =
            normalizedFlowStatus === "assigned"
                ? now
                : leadRow.acceptedAt || now;
        const isSkipStatus = nextSalesStatus === "skip";

        await tx
            .update(lead)
            .set({
                flowStatus: "accepted",
                acceptedAt: nextAcceptedAt,
                salesStatus: nextSalesStatus,
                clientStatus: nextSalesStatus,
                layer2Status: nextSalesStatus,
                ...(isSkipStatus
                    ? {
                        resultStatus: SKIP_AUTO_RESULT_STATUS,
                        resultStatusUpdatedAt:
                            leadRow.resultStatus === SKIP_AUTO_RESULT_STATUS && leadRow.resultStatusUpdatedAt
                                ? leadRow.resultStatusUpdatedAt
                                : now,
                        rejectedReason: SKIP_AUTO_CANCEL_REASON,
                        rejectedNote: SKIP_AUTO_CANCEL_NOTE,
                        unitName: null,
                        unitDetail: null,
                        paymentMethod: null,
                    }
                    : {}),
                updatedAt: now,
            })
            .where(eq(lead.id, leadRow.id));

        await tx
            .update(dailyTask)
            .set({
                screenshotUrl: params.screenshotUrl,
                submittedSalesStatus: nextSalesStatus,
                completedAt: now,
                status: "done",
                updatedAt: now,
            })
            .where(eq(dailyTask.id, taskRow.id));

        const acceptedCopy =
            normalizedFlowStatus === "assigned"
                ? ` Lead otomatis diterima, status L1 berubah dari ${getFlowStatusLabel(normalizedFlowStatus)} ke ${getFlowStatusLabel("accepted")}.`
                : "";

        await tx.insert(activity).values({
            id: generateId(),
            leadId: leadRow.id,
            type: "daily_task",
            note: `Daily Task New Lead diselesaikan oleh ${params.actorName}.${acceptedCopy} Status L2 diubah ke ${getSalesStatusLabel(nextSalesStatus)}.${isSkipStatus ? " Status transaksi otomatis menjadi Cancel Minat dengan alasan Lainnya." : ""}`,
            timestamp: now,
        });

        if (isSkipStatus) {
            await tx.insert(activity).values({
                id: generateId(),
                leadId: leadRow.id,
                type: "result_status",
                note: "Status transaksi otomatis menjadi Cancel Minat karena status L2 Skip. Alasan batal: Lainnya.",
                timestamp: now,
            });
        }

        await syncLeadDailyTasksForLead(leadRow.id, tx, now);

        const [updatedTask] = await tx
            .select()
            .from(dailyTask)
            .where(eq(dailyTask.id, taskRow.id))
            .limit(1);

        return updatedTask || null;
    });
}

export async function submitFollowUpTask(params: {
    taskId: string;
    actorId: string;
    actorName: string;
    screenshotUrl: string;
}) {
    if (!params.screenshotUrl) {
        throw new Error("DAILY_TASK_SCREENSHOT_REQUIRED");
    }

    return db.transaction(async (tx) => {
        const taskRow = await getTaskForSalesAction(params.taskId, params.actorId, "follow_up", tx);
        const [leadRow] = await tx
            .select({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                clientId: lead.clientId,
                assignedTo: lead.assignedTo,
                flowStatus: lead.flowStatus,
                acceptedAt: lead.acceptedAt,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
            })
            .from(lead)
            .where(eq(lead.id, taskRow.leadId))
            .limit(1);

        if (!leadRow) {
            throw new Error("LEAD_NOT_FOUND");
        }

        const appointmentTagMap = await getLatestAppointmentTagMap(tx, [leadRow.id]);
        const appointmentTag = appointmentTagMap.get(leadRow.id) || "none";
        if (!isLeadEligibleForFollowUpTask(leadRow, appointmentTag)) {
            await invalidateTaskIds([taskRow.id], tx, new Date());
            throw new Error("DAILY_TASK_NO_LONGER_ELIGIBLE");
        }

        const now = new Date();
        await tx
            .update(dailyTask)
            .set({
                screenshotUrl: params.screenshotUrl,
                completedAt: now,
                status: "done",
                updatedAt: now,
            })
            .where(eq(dailyTask.id, taskRow.id));

        const taskRows = await getLeadTaskRows(tx, leadRow.id);
        const completedCount = taskRows.filter(
            (task) =>
                task.taskType === "follow_up" &&
                task.status === "done" &&
                task.followupStage >= 1 &&
                task.followupStage <= DAILY_TASK_FOLLOWUP_STAGE_COUNT
        ).length;

        await tx.insert(activity).values({
            id: generateId(),
            leadId: leadRow.id,
            type: "daily_task",
            note: `${getFollowUpLabel(taskRow.followupStage)} diselesaikan oleh ${params.actorName}. Progress follow up menjadi ${Math.min(completedCount, DAILY_TASK_FOLLOWUP_STAGE_COUNT)}/${DAILY_TASK_FOLLOWUP_STAGE_COUNT}.`,
            timestamp: now,
        });

        await syncLeadDailyTasksForLead(leadRow.id, tx, now);

        const [updatedTask] = await tx
            .select()
            .from(dailyTask)
            .where(eq(dailyTask.id, taskRow.id))
            .limit(1);

        return updatedTask || null;
    });
}

export async function submitDeadlineLeadTask(params: {
    taskId: string;
    actorId: string;
    actorName: string;
    action: "change_to_cold" | "stay";
}) {
    return db.transaction(async (tx) => {
        const taskRow = await getTaskForSalesAction(
            params.taskId,
            params.actorId,
            "deadline_lead",
            tx
        );
        const [leadRow] = await tx
            .select({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                clientId: lead.clientId,
                assignedTo: lead.assignedTo,
                flowStatus: lead.flowStatus,
                acceptedAt: lead.acceptedAt,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
            })
            .from(lead)
            .where(eq(lead.id, taskRow.leadId))
            .limit(1);

        if (!leadRow) {
            throw new Error("LEAD_NOT_FOUND");
        }

        const now = new Date();
        const appointmentTagMap = await getLatestAppointmentTagMap(tx, [leadRow.id]);
        const appointmentTag = appointmentTagMap.get(leadRow.id) || "none";
        if (!isLeadBaseEligibleForDeadlineLeadTask(leadRow, appointmentTag)) {
            await invalidateTaskIds([taskRow.id], tx, now);
            throw new Error("DAILY_TASK_NO_LONGER_ELIGIBLE");
        }

        const isChangeToCold = params.action === "change_to_cold";
        if (isChangeToCold) {
            await tx
                .update(lead)
                .set({
                    salesStatus: "cold",
                    clientStatus: "cold",
                    layer2Status: "cold",
                    updatedAt: now,
                })
                .where(eq(lead.id, leadRow.id));
        }

        await tx
            .update(dailyTask)
            .set({
                completedAt: now,
                status: "done",
                submittedSalesStatus: isChangeToCold ? "cold" : leadRow.salesStatus || null,
                note: isChangeToCold ? "deadline_change_to_cold" : "deadline_stay",
                updatedAt: now,
            })
            .where(eq(dailyTask.id, taskRow.id));

        await tx.insert(activity).values({
            id: generateId(),
            leadId: leadRow.id,
            type: "daily_task",
            note: isChangeToCold
                ? `Deadline Leads diselesaikan oleh ${params.actorName}. Status L2 diubah ke ${getSalesStatusLabel("cold")}.`
                : `Deadline Leads diselesaikan oleh ${params.actorName}. Lead dipertahankan tanpa perubahan status.`,
            timestamp: now,
        });

        await syncLeadDailyTasksForLead(leadRow.id, tx, now);

        const [updatedTask] = await tx
            .select()
            .from(dailyTask)
            .where(eq(dailyTask.id, taskRow.id))
            .limit(1);

        return updatedTask || null;
    });
}

export async function getLeadFollowUpProgressMap(
    leadIds: string[],
    executor: DbExecutor = db
) {
    const map = new Map<string, {
        completedCount: number;
        totalSteps: number;
        stages: Array<{
            stepNo: number;
            label: string;
            status: string;
            eligibleAt: Date | null;
            dueAt: Date | null;
            completedAt: Date | null;
            screenshotUrl: string | null;
        }>;
    }>();

    if (leadIds.length === 0) {
        return map;
    }

    const rows = await executor
        .select()
        .from(dailyTask)
        .where(
            and(
                inArray(dailyTask.leadId, leadIds),
                eq(dailyTask.taskType, "follow_up")
            )
        )
        .orderBy(asc(dailyTask.followupStage), asc(dailyTask.createdAt));

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
        const list = grouped.get(row.leadId) || [];
        list.push(row);
        grouped.set(row.leadId, list);
    }

    for (const leadId of leadIds) {
        const taskRows = grouped.get(leadId) || [];
        const stageMap = new Map(taskRows.map((row) => [row.followupStage, row]));
        const stages = Array.from({ length: DAILY_TASK_FOLLOWUP_STAGE_COUNT }, (_, index) => {
            const stepNo = index + 1;
            const row = stageMap.get(stepNo);
            return {
                stepNo,
                label: getFollowUpLabel(stepNo),
                status: normalizeDailyTaskStatus(row?.status) || "pending",
                eligibleAt: row?.eligibleAt || null,
                dueAt: row?.dueAt || null,
                completedAt: row?.completedAt || null,
                screenshotUrl: row?.screenshotUrl || null,
            };
        });

        map.set(leadId, {
            completedCount: taskRows.filter((row) => row.status === "done").length,
            totalSteps: DAILY_TASK_FOLLOWUP_STAGE_COUNT,
            stages,
        });
    }

    return map;
}

export async function getSubmittedDailyTaskSnapshotForManagedSales(params: {
    managedSalesIds: string[];
    clientId?: string | null;
    now?: Date;
    executor?: DbExecutor;
}) {
    const executor = params.executor || db;
    const now = params.now || new Date();

    if (!params.managedSalesIds.length) {
        return [];
    }

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rows = await executor
        .select({
            id: dailyTask.id,
            leadId: dailyTask.leadId,
            salesId: dailyTask.salesId,
            taskType: dailyTask.taskType,
            followupStage: dailyTask.followupStage,
            screenshotUrl: dailyTask.screenshotUrl,
            submittedSalesStatus: dailyTask.submittedSalesStatus,
            completedAt: dailyTask.completedAt,
            dueAt: dailyTask.dueAt,
            createdAt: dailyTask.createdAt,
            leadName: lead.name,
            leadPhone: lead.phone,
            leadSource: lead.source,
            salesName: user.name,
        })
        .from(dailyTask)
        .innerJoin(lead, eq(dailyTask.leadId, lead.id))
        .leftJoin(user, eq(dailyTask.salesId, user.id))
        .where(
            and(
                inArray(dailyTask.salesId, params.managedSalesIds),
                eq(dailyTask.status, "done"),
                gte(dailyTask.completedAt, since),
                params.clientId ? eq(dailyTask.clientId, params.clientId) : undefined
            )
        )
        .orderBy(desc(dailyTask.completedAt), desc(dailyTask.createdAt));

    type SubmittedTaskSnapshot = {
        id: string;
        leadId: string;
        leadName: string;
        leadPhone: string;
        leadSource: string;
        taskType: string;
        followupStage: number;
        label: string;
        screenshotUrl: string | null;
        submittedSalesStatus: string | null;
        completedAt: Date | null;
        dueAt: Date | null;
        createdAt: Date;
    };

    type SubmittedTaskGroup = {
        salesId: string;
        salesName: string;
        taskCount: number;
        tasks: SubmittedTaskSnapshot[];
    };

    const grouped = new Map<string, SubmittedTaskGroup>();

    for (const row of rows) {
        const group = grouped.get(row.salesId) || {
            salesId: row.salesId,
            salesName: row.salesName || "Sales",
            taskCount: 0,
            tasks: [],
        };

        group.tasks.push({
            id: row.id,
            leadId: row.leadId,
            leadName: row.leadName,
            leadPhone: row.leadPhone,
            leadSource: row.leadSource,
            taskType: row.taskType,
            followupStage: row.followupStage,
            label: getTaskTypeLabel(row.taskType, row.followupStage),
            screenshotUrl: row.screenshotUrl || null,
            submittedSalesStatus: row.submittedSalesStatus || null,
            completedAt: row.completedAt,
            dueAt: row.dueAt,
            createdAt: row.createdAt,
        });
        group.taskCount = group.tasks.length;
        grouped.set(row.salesId, group);
    }

    return Array.from(grouped.values()).sort((a, b) => a.salesName.localeCompare(b.salesName));
}

export async function getDeadlineLeadTaskSnapshotForManagedSales(params: {
    managedSalesIds: string[];
    clientId?: string | null;
    now?: Date;
    executor?: DbExecutor;
}) {
    const executor = params.executor || db;
    const now = params.now || new Date();

    if (!params.managedSalesIds.length) {
        return [];
    }

    await markOverdueDailyTasks(executor, now);
    for (const salesId of params.managedSalesIds) {
        await reconcileTaskVisibilityForSales(salesId, params.clientId || null, executor, now);
    }

    const rows = await executor
        .select({
            id: dailyTask.id,
            leadId: dailyTask.leadId,
            salesId: dailyTask.salesId,
            taskType: dailyTask.taskType,
            followupStage: dailyTask.followupStage,
            eligibleAt: dailyTask.eligibleAt,
            dueAt: dailyTask.dueAt,
            status: dailyTask.status,
            createdAt: dailyTask.createdAt,
            updatedAt: dailyTask.updatedAt,
            leadName: lead.name,
            leadPhone: lead.phone,
            leadSource: lead.source,
            leadSalesStatus: lead.salesStatus,
            leadResultStatus: lead.resultStatus,
            leadCreatedAt: lead.createdAt,
            leadUpdatedAt: lead.updatedAt,
            salesName: user.name,
        })
        .from(dailyTask)
        .innerJoin(lead, eq(dailyTask.leadId, lead.id))
        .leftJoin(user, eq(dailyTask.salesId, user.id))
        .where(
            and(
                inArray(dailyTask.salesId, params.managedSalesIds),
                params.clientId ? eq(dailyTask.clientId, params.clientId) : undefined,
                eq(dailyTask.taskType, "deadline_lead"),
                inArray(dailyTask.status, ["pending", "overdue"])
            )
        )
        .orderBy(asc(dailyTask.dueAt), asc(dailyTask.createdAt));

    type DeadlineLeadTaskSnapshot = {
        id: string;
        leadId: string;
        leadName: string;
        leadPhone: string;
        leadSource: string;
        salesStatus: string | null;
        resultStatus: string | null;
        assignedAt: Date;
        dueAt: Date;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        label: string;
    };

    type DeadlineLeadTaskGroup = {
        salesId: string;
        salesName: string;
        taskCount: number;
        tasks: DeadlineLeadTaskSnapshot[];
    };

    const grouped = new Map<string, DeadlineLeadTaskGroup>();

    for (const row of rows) {
        const group = grouped.get(row.salesId) || {
            salesId: row.salesId,
            salesName: row.salesName || "Sales",
            taskCount: 0,
            tasks: [],
        };

        group.tasks.push({
            id: row.id,
            leadId: row.leadId,
            leadName: row.leadName,
            leadPhone: row.leadPhone,
            leadSource: row.leadSource,
            salesStatus: row.leadSalesStatus || null,
            resultStatus: row.leadResultStatus || null,
            assignedAt: row.eligibleAt,
            dueAt: row.dueAt,
            status: row.status,
            createdAt: row.leadCreatedAt,
            updatedAt: row.leadUpdatedAt,
            label: getTaskTypeLabel(row.taskType, row.followupStage),
        });
        group.taskCount = group.tasks.length;
        grouped.set(row.salesId, group);
    }

    return Array.from(grouped.values()).sort((a, b) => a.salesName.localeCompare(b.salesName));
}

export async function getLeadFollowUpProgress(
    leadId: string,
    executor: DbExecutor = db
) {
    const map = await getLeadFollowUpProgressMap([leadId], executor);
    return (
        map.get(leadId) || {
            completedCount: 0,
            totalSteps: DAILY_TASK_FOLLOWUP_STAGE_COUNT,
            stages: Array.from({ length: DAILY_TASK_FOLLOWUP_STAGE_COUNT }, (_, index) => ({
                stepNo: index + 1,
                label: getFollowUpLabel(index + 1),
                status: "pending",
                eligibleAt: null,
                dueAt: null,
                completedAt: null,
                screenshotUrl: null,
            })),
        }
    );
}
