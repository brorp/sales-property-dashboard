import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "../db";
import {
    activity,
    distributionAttempt,
    distributionCycle,
    lead,
    salesQueue,
    user,
    waMessage,
} from "../db/schema";
import { generateId } from "../utils/id";

const ACK_TIMEOUT_MS = 5 * 60 * 1000;
const PROPERTY_LOUNGE_WA = process.env.PROPERTY_LOUNGE_WA || "+620000000000";

type DbExecutor = typeof db;

interface QueueEntry {
    salesId: string;
    queueOrder: number;
    salesName: string;
    salesPhone: string | null;
}

async function getNextQueueEntry(
    executor: DbExecutor,
    currentQueueOrder: number
): Promise<QueueEntry | null> {
    const [entry] = await executor
        .select({
            salesId: salesQueue.salesId,
            queueOrder: salesQueue.queueOrder,
            salesName: user.name,
            salesPhone: user.phone,
        })
        .from(salesQueue)
        .innerJoin(user, eq(salesQueue.salesId, user.id))
        .where(
            and(
                eq(salesQueue.isActive, true),
                eq(user.role, "sales"),
                eq(user.isActive, true),
                gt(salesQueue.queueOrder, currentQueueOrder)
            )
        )
        .orderBy(asc(salesQueue.queueOrder))
        .limit(1);

    return entry ?? null;
}

async function logDistributionActivity(
    executor: DbExecutor,
    leadId: string,
    type: string,
    note: string
) {
    await executor.insert(activity).values({
        id: generateId(),
        leadId,
        type,
        note,
        timestamp: new Date(),
    });
}

async function assignNextQueue(
    executor: DbExecutor,
    cycleId: string,
    leadId: string,
    currentQueueOrder: number
) {
    const next = await getNextQueueEntry(executor, currentQueueOrder);
    const now = new Date();

    if (!next) {
        await executor
            .update(distributionCycle)
            .set({
                status: "exhausted",
                finishedAt: now,
                currentQueueOrder,
            })
            .where(eq(distributionCycle.id, cycleId));

        await executor
            .update(lead)
            .set({
                assignedTo: null,
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        await logDistributionActivity(
            executor,
            leadId,
            "pending",
            "Distribusi berhenti: semua antrian sales sudah timeout."
        );

        return null;
    }

    const ackDeadline = new Date(now.getTime() + ACK_TIMEOUT_MS);

    const [attempt] = await executor
        .insert(distributionAttempt)
        .values({
            id: generateId(),
            cycleId,
            leadId,
            salesId: next.salesId,
            queueOrder: next.queueOrder,
            status: "waiting_ok",
            assignedAt: now,
            ackDeadline,
        })
        .returning();

    await executor
        .update(distributionCycle)
        .set({
            currentQueueOrder: next.queueOrder,
            status: "active",
        })
        .where(eq(distributionCycle.id, cycleId));

    await executor
        .update(lead)
        .set({
            assignedTo: next.salesId,
            updatedAt: now,
        })
        .where(eq(lead.id, leadId));

    await executor.insert(waMessage).values({
        id: generateId(),
        fromWa: PROPERTY_LOUNGE_WA,
        toWa: next.salesPhone || `sales:${next.salesId}`,
        body: `Lead baru dialokasikan. Balas OK dalam 5 menit untuk claim lead ${leadId}.`,
        direction: "outbound_to_sales",
        leadId,
        salesId: next.salesId,
        createdAt: now,
    });

    await logDistributionActivity(
        executor,
        leadId,
        "follow-up",
        `Lead didistribusikan ke ${next.salesName} (urutan ${next.queueOrder}), tunggu ACK OK hingga ${ackDeadline.toISOString()}.`
    );

    return attempt;
}

async function getLatestCycleByLead(leadId: string) {
    const [cycle] = await db
        .select()
        .from(distributionCycle)
        .where(eq(distributionCycle.leadId, leadId))
        .orderBy(desc(distributionCycle.startedAt))
        .limit(1);

    return cycle ?? null;
}

export async function ensureActiveCycle(leadId: string) {
    const [active] = await db
        .select()
        .from(distributionCycle)
        .where(
            and(
                eq(distributionCycle.leadId, leadId),
                eq(distributionCycle.status, "active")
            )
        )
        .orderBy(desc(distributionCycle.startedAt))
        .limit(1);

    if (active) {
        return active;
    }

    const now = new Date();
    const [cycle] = await db
        .insert(distributionCycle)
        .values({
            id: generateId(),
            leadId,
            status: "active",
            currentQueueOrder: 0,
            startedAt: now,
        })
        .returning();

    await assignNextQueue(db, cycle.id, leadId, 0);
    const [freshCycle] = await db
        .select()
        .from(distributionCycle)
        .where(eq(distributionCycle.id, cycle.id))
        .limit(1);
    return freshCycle || cycle;
}

export async function handleSalesAck(
    leadId: string,
    salesId: string,
    messageBody: string
) {
    if (messageBody.trim().toLowerCase() !== "ok") {
        return { accepted: false, reason: "message_not_ok" as const };
    }

    const [waitingAttempt] = await db
        .select()
        .from(distributionAttempt)
        .where(
            and(
                eq(distributionAttempt.leadId, leadId),
                eq(distributionAttempt.salesId, salesId),
                eq(distributionAttempt.status, "waiting_ok")
            )
        )
        .orderBy(desc(distributionAttempt.assignedAt))
        .limit(1);

    if (!waitingAttempt) {
        return { accepted: false, reason: "no_waiting_attempt" as const };
    }

    const now = new Date();

    await db.transaction(async (tx) => {
        await tx
            .update(distributionAttempt)
            .set({
                status: "accepted",
                ackAt: now,
                closedAt: now,
                closeReason: "ack_ok",
            })
            .where(
                and(
                    eq(distributionAttempt.id, waitingAttempt.id),
                    eq(distributionAttempt.status, "waiting_ok")
                )
            );

        await tx
            .update(distributionCycle)
            .set({
                status: "accepted",
                finishedAt: now,
            })
            .where(eq(distributionCycle.id, waitingAttempt.cycleId));

        await tx
            .update(lead)
            .set({
                assignedTo: salesId,
                progress: "follow-up",
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        await logDistributionActivity(
            tx as unknown as DbExecutor,
            leadId,
            "follow-up",
            `Lead di-claim sales ${salesId} dengan balasan OK.`
        );
    });

    return { accepted: true, reason: "accepted" as const };
}

async function timeoutAttemptAndRoll(attemptId: string) {
    await db.transaction(async (tx) => {
        const [attempt] = await tx
            .select()
            .from(distributionAttempt)
            .where(
                and(
                    eq(distributionAttempt.id, attemptId),
                    eq(distributionAttempt.status, "waiting_ok")
                )
            )
            .limit(1);

        if (!attempt) {
            return;
        }

        const now = new Date();
        await tx
            .update(distributionAttempt)
            .set({
                status: "timeout",
                closedAt: now,
                closeReason: "ack_timeout_5m",
            })
            .where(eq(distributionAttempt.id, attempt.id));

        await logDistributionActivity(
            tx as unknown as DbExecutor,
            attempt.leadId,
            "pending",
            `Sales ${attempt.salesId} timeout (tidak membalas OK dalam 5 menit).`
        );

        await assignNextQueue(
            tx as unknown as DbExecutor,
            attempt.cycleId,
            attempt.leadId,
            attempt.queueOrder
        );
    });
}

export async function processExpiredAttempts() {
    const now = new Date();
    const attempts = await db
        .select({ id: distributionAttempt.id })
        .from(distributionAttempt)
        .where(
            and(
                eq(distributionAttempt.status, "waiting_ok"),
                lte(distributionAttempt.ackDeadline, now)
            )
        )
        .orderBy(asc(distributionAttempt.ackDeadline))
        .limit(100);

    for (const attempt of attempts) {
        await timeoutAttemptAndRoll(attempt.id);
    }

    return attempts.length;
}

export async function getLeadDistributionState(leadId: string) {
    const cycle = await getLatestCycleByLead(leadId);
    const attempts = cycle
        ? await db
              .select()
              .from(distributionAttempt)
              .where(eq(distributionAttempt.cycleId, cycle.id))
              .orderBy(asc(distributionAttempt.queueOrder), asc(distributionAttempt.assignedAt))
        : [];

    return { cycle, attempts };
}
