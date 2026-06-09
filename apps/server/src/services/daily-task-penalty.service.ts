import { and, asc, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db/index";
import {
    activity,
    dailyTask,
    dailyTaskPenalty,
    dailyTaskPenaltyImmunity,
    dailyTaskPenaltySuspension,
    lead,
    user,
} from "../db/schema";
import type { QueryScope } from "../middleware/rbac";
import { createSalesSuspension, getActiveSalesSuspension } from "./sales-suspension.service";
import { removeSalesFromQueueBySuspension } from "./sales.service";
import { generateId } from "../utils/id";
import {
    getPenaltyDurationHours,
    getPenaltyDurationLabel,
    getPenaltySPLevel,
} from "../utils/lead-workflow";
import { syncLeadDailyTasksForLead } from "./daily-task.service";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function canCountPenaltyStatus(status: string | null | undefined) {
    return status !== "compensated" && status !== "invalid";
}

function assertCanManagePenaltyImmunity(scope?: QueryScope) {
    if (!scope || (scope.role !== "client_admin" && scope.role !== "root_admin")) {
        throw new Error("FORBIDDEN_PENALTY_IMMUNITY");
    }
}

function buildPenaltyImmunityClientCondition(clientId: string | null | undefined) {
    return clientId ? eq(dailyTaskPenaltyImmunity.clientId, clientId) : isNull(dailyTaskPenaltyImmunity.clientId);
}

async function loadSalesForPenaltyImmunityAction(
    salesId: string,
    scope?: QueryScope,
    executor: DbExecutor = db
) {
    const [salesRow] = await executor
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, salesId))
        .limit(1);

    if (!salesRow || salesRow.role !== "sales" || !salesRow.isActive) {
        throw new Error("SALES_NOT_FOUND");
    }

    return {
        ...salesRow,
        immunityClientId: scope?.clientId || salesRow.clientId || null,
    };
}

export async function isSalesPenaltyImmune(
    salesId: string,
    clientId?: string | null,
    executor: DbExecutor = db
) {
    const [row] = await executor
        .select({ id: dailyTaskPenaltyImmunity.id })
        .from(dailyTaskPenaltyImmunity)
        .where(and(
            eq(dailyTaskPenaltyImmunity.salesId, salesId),
            buildPenaltyImmunityClientCondition(clientId || null),
            eq(dailyTaskPenaltyImmunity.status, "active")
        ))
        .limit(1);

    return Boolean(row);
}

export async function countValidPenaltiesForSales(
    salesId: string,
    executor: DbExecutor = db
) {
    const rows = await executor
        .select({
            id: dailyTaskPenalty.id,
            status: dailyTaskPenalty.status,
        })
        .from(dailyTaskPenalty)
        .where(eq(dailyTaskPenalty.salesId, salesId));

    return rows.filter((row) => canCountPenaltyStatus(row.status)).length;
}

async function getPenaltyCandidateRows(
    executor: DbExecutor,
    now: Date
) {
    return executor
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
            leadName: lead.name,
            leadAssignedTo: lead.assignedTo,
            salesName: user.name,
        })
        .from(dailyTask)
        .innerJoin(lead, eq(dailyTask.leadId, lead.id))
        .leftJoin(user, eq(dailyTask.salesId, user.id))
        .where(
            and(
                inArray(dailyTask.status, ["pending", "overdue"]),
                ne(dailyTask.taskType, "deadline_lead"),
                lte(dailyTask.dueAt, now)
            )
        )
        .orderBy(asc(dailyTask.dueAt), asc(dailyTask.createdAt));
}

export async function createPenaltyForTask(
    taskId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const [taskRow] = await executor
        .select({
            id: dailyTask.id,
            leadId: dailyTask.leadId,
            salesId: dailyTask.salesId,
            clientId: dailyTask.clientId,
            taskType: dailyTask.taskType,
            followupStage: dailyTask.followupStage,
            dueAt: dailyTask.dueAt,
            status: dailyTask.status,
            leadName: lead.name,
            salesName: user.name,
        })
        .from(dailyTask)
        .innerJoin(lead, eq(dailyTask.leadId, lead.id))
        .leftJoin(user, eq(dailyTask.salesId, user.id))
        .where(eq(dailyTask.id, taskId))
        .limit(1);

    if (!taskRow) {
        throw new Error("DAILY_TASK_NOT_FOUND");
    }

    const existingPenalty = await executor
        .select({
            id: dailyTaskPenalty.id,
        })
        .from(dailyTaskPenalty)
        .where(eq(dailyTaskPenalty.taskId, taskId))
        .limit(1);

    if (existingPenalty[0]) {
        return null;
    }

    if (taskRow.taskType === "deadline_lead") {
        return null;
    }

    const isImmune = await isSalesPenaltyImmune(
        taskRow.salesId,
        taskRow.clientId || null,
        executor
    );
    if (isImmune) {
        return null;
    }

    const activeSuspension = await getActiveSalesSuspension(taskRow.salesId, executor, now);
    if (activeSuspension) {
        return null;
    }

    const previousPenaltyCount = await countValidPenaltiesForSales(taskRow.salesId, executor);
    const penaltySequence = previousPenaltyCount + 1;
    const durationHours = getPenaltyDurationHours(penaltySequence);
    const spLevel = getPenaltySPLevel(penaltySequence);
    const blockedUntil = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    const salesLabel = taskRow.salesName || "Sales";
    const taskLabel =
        taskRow.taskType === "follow_up"
            ? `Follow Up ${taskRow.followupStage}`
            : "New Lead";
    const reason = `${taskLabel} tidak diselesaikan dalam 24 jam sejak muncul di Daily Task`;

    return executor.transaction(async (tx) => {
        const [insertedPenalty] = await tx
            .insert(dailyTaskPenalty)
            .values({
                id: generateId(),
                salesId: taskRow.salesId,
                clientId: taskRow.clientId || null,
                taskId: taskRow.id,
                penaltySequence,
                blockedFrom: now,
                blockedUntil,
                durationHours,
                spLevel,
                status: "active",
                reason,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoNothing()
            .returning();

        if (!insertedPenalty) {
            return null;
        }

        await tx
            .update(dailyTask)
            .set({
                status: "overdue",
                updatedAt: now,
            })
            .where(eq(dailyTask.id, taskRow.id));

        await createSalesSuspension(
            {
                salesId: taskRow.salesId,
                clientId: taskRow.clientId || null,
                penaltyId: insertedPenalty.id,
                durationHours,
                suspendedFrom: now,
            },
            tx
        );

        const penaltyNote = `Penalty #${penaltySequence} diberikan ke ${salesLabel} karena ${reason}. Distribution queue diblok selama ${getPenaltyDurationLabel(durationHours)}${spLevel !== "none" ? ` dan ${spLevel.toUpperCase()} diterbitkan` : ""}.`;
        await tx.insert(activity).values({
            id: generateId(),
            leadId: taskRow.leadId,
            type: "penalty",
            note: penaltyNote,
            timestamp: now,
        });

        const removedFromQueue = taskRow.clientId
            ? await removeSalesFromQueueBySuspension(
                {
                    clientId: taskRow.clientId,
                    salesId: taskRow.salesId,
                },
                tx
            )
            : false;

        if (removedFromQueue) {
            await tx.insert(activity).values({
                id: generateId(),
                leadId: taskRow.leadId,
                type: "distribution",
                note: `${salesLabel} dikeluarkan dari distribution queue karena penalty aktif.`,
                timestamp: now,
            });
        }

        return insertedPenalty;
    });
}

export async function processMissedDailyTasks(now: Date = new Date()) {
    const candidates = await getPenaltyCandidateRows(db, now);
    let createdCount = 0;
    const penalizedSalesIds = new Set<string>();

    for (const candidate of candidates) {
        if (penalizedSalesIds.has(candidate.salesId)) {
            continue;
        }

        await syncLeadDailyTasksForLead(candidate.leadId, db, now);

        const [freshTask] = await db
            .select()
            .from(dailyTask)
            .where(eq(dailyTask.id, candidate.id))
            .limit(1);

        if (!freshTask || !["pending", "overdue"].includes(freshTask.status)) {
            continue;
        }

        const penalty = await createPenaltyForTask(candidate.id, db, now);
        if (penalty) {
            createdCount += 1;
            penalizedSalesIds.add(candidate.salesId);
        }
    }

    return createdCount;
}

export async function compensatePenalty(params: {
    penaltyId: string;
    compensatedById: string;
    reason: string;
    scope?: QueryScope;
}) {
    const trimmedReason = String(params.reason || "").trim();
    if (!trimmedReason) {
        throw new Error("PENALTY_COMPENSATION_REASON_REQUIRED");
    }

    return db.transaction(async (tx) => {
        const [penaltyRow] = await tx
            .select({
                id: dailyTaskPenalty.id,
                salesId: dailyTaskPenalty.salesId,
                clientId: dailyTaskPenalty.clientId,
                taskId: dailyTaskPenalty.taskId,
                status: dailyTaskPenalty.status,
                taskLeadId: dailyTask.leadId,
                taskType: dailyTask.taskType,
                followupStage: dailyTask.followupStage,
                salesName: user.name,
            })
            .from(dailyTaskPenalty)
            .innerJoin(dailyTask, eq(dailyTaskPenalty.taskId, dailyTask.id))
            .leftJoin(user, eq(dailyTaskPenalty.salesId, user.id))
            .where(eq(dailyTaskPenalty.id, params.penaltyId))
            .limit(1);

        if (!penaltyRow) {
            throw new Error("PENALTY_NOT_FOUND");
        }

        if (
            params.scope &&
            params.scope.role !== "root_admin" &&
            params.scope.clientId &&
            penaltyRow.clientId !== params.scope.clientId
        ) {
            throw new Error("PENALTY_NOT_FOUND");
        }

        if (penaltyRow.status === "compensated") {
            return penaltyRow;
        }

        const now = new Date();
        await tx
            .update(dailyTaskPenalty)
            .set({
                status: "compensated",
                compensatedBy: params.compensatedById,
                compensatedAt: now,
                compensationReason: trimmedReason,
                updatedAt: now,
            })
            .where(eq(dailyTaskPenalty.id, penaltyRow.id));

        await tx
            .update(dailyTaskPenaltySuspension)
            .set({
                status: "compensated",
                updatedAt: now,
            })
            .where(eq(dailyTaskPenaltySuspension.penaltyId, penaltyRow.id));

        await tx.insert(activity).values({
            id: generateId(),
            leadId: penaltyRow.taskLeadId,
            type: "penalty",
            note: `Penalty untuk ${penaltyRow.salesName || "Sales"} dikompensasi admin. Alasan: ${trimmedReason}`,
            timestamp: now,
        });

        return penaltyRow;
    });
}

export async function getPenalties(params: {
    role: string;
    requesterId: string;
    scope?: QueryScope;
    salesId?: string | null;
}) {
    const conditions = [];

    if (params.role === "root_admin") {
        // no scope
    } else if (params.role === "client_admin" && params.scope?.clientId) {
        conditions.push(eq(dailyTaskPenalty.clientId, params.scope.clientId));
    } else if (params.role === "supervisor") {
        if (params.scope?.managedSalesIds?.length) {
            conditions.push(inArray(dailyTaskPenalty.salesId, params.scope.managedSalesIds));
        } else {
            conditions.push(eq(dailyTaskPenalty.salesId, "__none__"));
        }
    } else {
        conditions.push(eq(dailyTaskPenalty.salesId, params.requesterId));
    }

    if (params.salesId) {
        conditions.push(eq(dailyTaskPenalty.salesId, params.salesId));
    }

    const rows = await db
        .select({
            id: dailyTaskPenalty.id,
            salesId: dailyTaskPenalty.salesId,
            clientId: dailyTaskPenalty.clientId,
            taskId: dailyTaskPenalty.taskId,
            penaltySequence: dailyTaskPenalty.penaltySequence,
            blockedFrom: dailyTaskPenalty.blockedFrom,
            blockedUntil: dailyTaskPenalty.blockedUntil,
            durationHours: dailyTaskPenalty.durationHours,
            spLevel: dailyTaskPenalty.spLevel,
            status: dailyTaskPenalty.status,
            compensatedBy: dailyTaskPenalty.compensatedBy,
            compensatedAt: dailyTaskPenalty.compensatedAt,
            compensationReason: dailyTaskPenalty.compensationReason,
            reason: dailyTaskPenalty.reason,
            createdAt: dailyTaskPenalty.createdAt,
            updatedAt: dailyTaskPenalty.updatedAt,
            taskType: dailyTask.taskType,
            followupStage: dailyTask.followupStage,
            leadId: dailyTask.leadId,
            leadName: lead.name,
            salesName: user.name,
        })
        .from(dailyTaskPenalty)
        .innerJoin(dailyTask, eq(dailyTaskPenalty.taskId, dailyTask.id))
        .leftJoin(lead, eq(dailyTask.leadId, lead.id))
        .leftJoin(user, eq(dailyTaskPenalty.salesId, user.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(dailyTaskPenalty.createdAt), desc(dailyTaskPenalty.blockedUntil));

    return rows.map((row) => ({
        ...row,
        taskLabel:
            row.taskType === "follow_up"
                ? `Follow Up ${row.followupStage}`
                : "New Lead",
    }));
}

export async function listPenaltyImmunities(params: {
    scope?: QueryScope;
}) {
    assertCanManagePenaltyImmunity(params.scope);

    const conditions = [eq(dailyTaskPenaltyImmunity.status, "active")];
    if (params.scope?.role !== "root_admin") {
        conditions.push(buildPenaltyImmunityClientCondition(params.scope?.clientId || null));
    }

    return db
        .select({
            id: dailyTaskPenaltyImmunity.id,
            salesId: dailyTaskPenaltyImmunity.salesId,
            clientId: dailyTaskPenaltyImmunity.clientId,
            status: dailyTaskPenaltyImmunity.status,
            grantedBy: dailyTaskPenaltyImmunity.grantedBy,
            grantedAt: dailyTaskPenaltyImmunity.grantedAt,
            createdAt: dailyTaskPenaltyImmunity.createdAt,
            updatedAt: dailyTaskPenaltyImmunity.updatedAt,
            salesName: user.name,
            salesEmail: user.email,
        })
        .from(dailyTaskPenaltyImmunity)
        .leftJoin(user, eq(dailyTaskPenaltyImmunity.salesId, user.id))
        .where(and(...conditions))
        .orderBy(desc(dailyTaskPenaltyImmunity.grantedAt), asc(user.name));
}

export async function addPenaltyImmunity(params: {
    salesId: string;
    grantedById: string;
    scope?: QueryScope;
}) {
    assertCanManagePenaltyImmunity(params.scope);
    const salesId = String(params.salesId || "").trim();
    if (!salesId) {
        throw new Error("SALES_ID_REQUIRED");
    }

    return db.transaction(async (tx) => {
        const salesRow = await loadSalesForPenaltyImmunityAction(salesId, params.scope, tx);
        const clientId = salesRow.immunityClientId;
        const now = new Date();

        const [existing] = await tx
            .select({
                id: dailyTaskPenaltyImmunity.id,
            })
            .from(dailyTaskPenaltyImmunity)
            .where(and(
                eq(dailyTaskPenaltyImmunity.salesId, salesRow.id),
                buildPenaltyImmunityClientCondition(clientId)
            ))
            .limit(1);

        if (existing) {
            const [updated] = await tx
                .update(dailyTaskPenaltyImmunity)
                .set({
                    status: "active",
                    grantedBy: params.grantedById,
                    revokedBy: null,
                    grantedAt: now,
                    revokedAt: null,
                    updatedAt: now,
                })
                .where(eq(dailyTaskPenaltyImmunity.id, existing.id))
                .returning();

            return {
                ...updated,
                salesName: salesRow.name,
                salesEmail: salesRow.email,
            };
        }

        const [inserted] = await tx
            .insert(dailyTaskPenaltyImmunity)
            .values({
                id: generateId(),
                salesId: salesRow.id,
                clientId,
                grantedBy: params.grantedById,
                status: "active",
                grantedAt: now,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        return {
            ...inserted,
            salesName: salesRow.name,
            salesEmail: salesRow.email,
        };
    });
}

export async function removePenaltyImmunity(params: {
    salesId: string;
    revokedById: string;
    scope?: QueryScope;
}) {
    assertCanManagePenaltyImmunity(params.scope);
    const salesId = String(params.salesId || "").trim();
    if (!salesId) {
        throw new Error("SALES_ID_REQUIRED");
    }

    return db.transaction(async (tx) => {
        const salesRow = await loadSalesForPenaltyImmunityAction(salesId, params.scope, tx);
        const clientId = salesRow.immunityClientId;
        const now = new Date();

        const [updated] = await tx
            .update(dailyTaskPenaltyImmunity)
            .set({
                status: "revoked",
                revokedBy: params.revokedById,
                revokedAt: now,
                updatedAt: now,
            })
            .where(and(
                eq(dailyTaskPenaltyImmunity.salesId, salesRow.id),
                buildPenaltyImmunityClientCondition(clientId),
                eq(dailyTaskPenaltyImmunity.status, "active")
            ))
            .returning();

        return {
            success: true,
            salesId: salesRow.id,
            updated: Boolean(updated),
        };
    });
}
