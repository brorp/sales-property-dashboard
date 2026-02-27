import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { salesQueue, user } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { auth } from "../auth";

type DbExecutor = typeof db;

function queueLabelFromOrder(order: number) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (order >= 1 && order <= alphabet.length) {
        return alphabet[order - 1];
    }
    return `Q${order}`;
}

async function getActiveQueueRows(executor: DbExecutor) {
    return executor
        .select({
            id: salesQueue.id,
            salesId: salesQueue.salesId,
            queueOrder: salesQueue.queueOrder,
            salesName: user.name,
        })
        .from(salesQueue)
        .innerJoin(user, eq(salesQueue.salesId, user.id))
        .where(
            and(
                eq(salesQueue.isActive, true),
                eq(user.role, "sales"),
                eq(user.isActive, true)
            )
        )
        .orderBy(asc(salesQueue.queueOrder), asc(user.name));
}

async function resequenceQueue(executor: DbExecutor, orderedRows: Array<{ id: string }>) {
    const now = new Date();

    // Two-phase update to avoid unique constraint conflicts on queueOrder.
    for (let i = 0; i < orderedRows.length; i += 1) {
        await executor
            .update(salesQueue)
            .set({
                queueOrder: 1000 + i + 1,
                updatedAt: now,
            })
            .where(eq(salesQueue.id, orderedRows[i].id));
    }

    for (let i = 0; i < orderedRows.length; i += 1) {
        const queueOrder = i + 1;
        await executor
            .update(salesQueue)
            .set({
                queueOrder,
                label: queueLabelFromOrder(queueOrder),
                updatedAt: now,
            })
            .where(eq(salesQueue.id, orderedRows[i].id));
    }
}

export async function getSalesUsers() {
    return db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
            queueOrder: salesQueue.queueOrder,
            queueLabel: salesQueue.label,
        })
        .from(user)
        .leftJoin(salesQueue, eq(salesQueue.salesId, user.id))
        .where(eq(user.role, "sales"))
        .orderBy(asc(salesQueue.queueOrder), asc(user.name));
}

export async function upsertSalesQueue(
    salesId: string,
    queueOrder: number,
    label: string
) {
    const now = new Date();

    const [existing] = await db
        .select({ id: salesQueue.id })
        .from(salesQueue)
        .where(eq(salesQueue.salesId, salesId))
        .limit(1);

    if (!existing) {
        const [created] = await db
            .insert(salesQueue)
            .values({
                id: generateId(),
                salesId,
                queueOrder,
                label,
                isActive: true,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        return created;
    }

    const [updated] = await db
        .update(salesQueue)
        .set({
            queueOrder,
            label,
            updatedAt: now,
        })
        .where(eq(salesQueue.id, existing.id))
        .returning();

    return updated;
}

export async function reorderSalesQueue(salesIds: string[]) {
    const orderedIds = Array.from(
        new Set((salesIds || []).filter((id) => typeof id === "string" && id.trim().length > 0))
    );

    if (orderedIds.length === 0) {
        throw new Error("INVALID_QUEUE_PAYLOAD");
    }

    await db.transaction(async (tx) => {
        const queueRows = await getActiveQueueRows(tx as unknown as DbExecutor);
        if (queueRows.length === 0) {
            throw new Error("QUEUE_EMPTY");
        }

        if (orderedIds.length !== queueRows.length) {
            throw new Error("QUEUE_SIZE_MISMATCH");
        }

        const queueBySalesId = new Map(queueRows.map((row) => [row.salesId, row]));
        const reorderedRows = orderedIds.map((salesId) => queueBySalesId.get(salesId) || null);

        if (reorderedRows.some((row) => !row)) {
            throw new Error("UNKNOWN_SALES_IN_QUEUE");
        }

        await resequenceQueue(
            tx as unknown as DbExecutor,
            reorderedRows as Array<{ id: string }>
        );
    });

    return getSalesUsers();
}

export async function rotateQueueAfterAssignment(
    acceptedSalesId: string,
    executor: DbExecutor = db
) {
    const queueRows = await getActiveQueueRows(executor);
    if (queueRows.length <= 1) {
        return false;
    }

    const currentIndex = queueRows.findIndex((row) => row.salesId === acceptedSalesId);
    if (currentIndex === -1 || currentIndex === queueRows.length - 1) {
        return false;
    }

    const reorderedRows = [
        ...queueRows.slice(0, currentIndex),
        ...queueRows.slice(currentIndex + 1),
        queueRows[currentIndex],
    ];

    await resequenceQueue(
        executor,
        reorderedRows.map((row) => ({ id: row.id }))
    );

    return true;
}

export async function createSalesUser(data: {
    name: string;
    email: string;
    password: string;
    phone?: string | null;
    queueOrder?: number | null;
    queueLabel?: string | null;
}) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const now = new Date();

    const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, normalizedEmail))
        .limit(1);

    if (existing) {
        throw new Error("EMAIL_ALREADY_EXISTS");
    }

    let createdUserId: string | null = null;
    try {
        const result = await auth.api.signUpEmail({
            body: {
                name: data.name.trim(),
                email: normalizedEmail,
                password: data.password,
                role: "sales",
            },
        });
        createdUserId = result.user.id;
    } catch {
        // Fallback payload if additional field is rejected by auth provider.
        const result = await auth.api.signUpEmail({
            body: {
                name: data.name.trim(),
                email: normalizedEmail,
                password: data.password,
            },
        });
        createdUserId = result.user.id;
    }

    if (!createdUserId) {
        throw new Error("FAILED_TO_CREATE_USER");
    }

    await db
        .update(user)
        .set({
            role: "sales",
            phone: data.phone ? normalizePhone(data.phone) : null,
            isActive: true,
            updatedAt: now,
        })
        .where(eq(user.id, createdUserId));

    let queue = null;
    if (typeof data.queueOrder === "number" && data.queueOrder > 0) {
        queue = await upsertSalesQueue(
            createdUserId,
            data.queueOrder,
            data.queueLabel?.trim() || `Q${data.queueOrder}`
        );
    }

    const [created] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, createdUserId))
        .limit(1);

    return {
        ...created,
        queueOrder: queue?.queueOrder || null,
        queueLabel: queue?.label || null,
    };
}
