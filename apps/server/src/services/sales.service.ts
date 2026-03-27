import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { salesQueue, user } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { auth } from "../auth/index";
import {
    assertSalesNotSuspended,
    getActiveSalesSuspensionMap,
} from "./sales-suspension.service";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type SalesQueryScope = {
    clientId?: string | null;
    supervisorId?: string | null;
    salesId?: string | null;
};

function queueLabelFromOrder(order: number) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (order >= 1 && order <= alphabet.length) {
        return alphabet[order - 1];
    }
    return `Q${order}`;
}

async function getActiveQueueRows(executor: DbExecutor, clientId: string) {
    const rows = await executor
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
                eq(salesQueue.clientId, clientId),
                eq(salesQueue.isActive, true),
                eq(user.role, "sales"),
                eq(user.isActive, true)
            )
        )
        .orderBy(asc(salesQueue.queueOrder), asc(user.name));

    const suspensionMap = await getActiveSalesSuspensionMap(
        rows.map((row) => row.salesId),
        executor
    );

    return rows.filter((row) => !suspensionMap.has(row.salesId));
}

async function getHighestQueueOrder(executor: DbExecutor, clientId: string) {
    const [row] = await executor
        .select({
            queueOrder: salesQueue.queueOrder,
        })
        .from(salesQueue)
        .where(eq(salesQueue.clientId, clientId))
        .orderBy(desc(salesQueue.queueOrder))
        .limit(1);

    return Number(row?.queueOrder || 0);
}

async function getQueueRowBySalesId(executor: DbExecutor, salesId: string) {
    const [row] = await executor
        .select({
            id: salesQueue.id,
            salesId: salesQueue.salesId,
            clientId: salesQueue.clientId,
            queueOrder: salesQueue.queueOrder,
            label: salesQueue.label,
            isActive: salesQueue.isActive,
        })
        .from(salesQueue)
        .where(eq(salesQueue.salesId, salesId))
        .limit(1);

    return row || null;
}

async function getSalesRow(executor: DbExecutor, salesId: string) {
    const [salesRow] = await executor
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, salesId))
        .limit(1);

    return salesRow || null;
}

async function resequenceQueue(
    executor: DbExecutor,
    clientId: string,
    orderedRows: Array<{ id: string }>
) {
    const now = new Date();
    const highestOrder = await getHighestQueueOrder(executor, clientId);
    const temporaryOrderBase = highestOrder + 1000;

    for (let i = 0; i < orderedRows.length; i += 1) {
        await executor
            .update(salesQueue)
            .set({
                queueOrder: temporaryOrderBase + i + 1,
                updatedAt: now,
            })
            .where(and(eq(salesQueue.id, orderedRows[i].id), eq(salesQueue.clientId, clientId)));
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
            .where(and(eq(salesQueue.id, orderedRows[i].id), eq(salesQueue.clientId, clientId)));
    }
}

export async function getSalesUsers(scope: SalesQueryScope = {}) {
    const conditions: any[] = [eq(user.role, "sales"), eq(user.isActive, true)];
    if (scope.clientId) {
        conditions.push(eq(user.clientId, scope.clientId));
    }
    if (scope.supervisorId) {
        conditions.push(eq(user.supervisorId, scope.supervisorId));
    }
    if (scope.salesId) {
        conditions.push(eq(user.id, scope.salesId));
    }

    const rows = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
            queueOrder: salesQueue.queueOrder,
            queueLabel: salesQueue.label,
        })
        .from(user)
        .leftJoin(
            salesQueue,
            and(eq(salesQueue.salesId, user.id), eq(salesQueue.isActive, true))
        )
        .where(and(...conditions))
        .orderBy(asc(salesQueue.queueOrder), asc(user.name));

    const suspensionMap = await getActiveSalesSuspensionMap(rows.map((row) => row.id));

    return rows.map((row) => {
        const suspension = suspensionMap.get(row.id) || null;
        return {
            ...row,
            isSuspended: Boolean(suspension),
            suspension: suspension
                ? {
                    penaltyLayer: suspension.penaltyLayer,
                    suspendedDays: suspension.suspendedDays,
                    suspendedFrom: suspension.suspendedFrom,
                    suspendedUntil: suspension.suspendedUntil,
                    ruleCode: suspension.ruleCode,
                }
                : null,
        };
    });
}

export async function getDistributionQueue(clientId: string) {
    const rows = await getSalesUsers({ clientId });
    const queueRows = rows
        .filter((row) => Number(row.queueOrder) > 0 && !row.isSuspended)
        .sort((a, b) => {
            const aOrder = Number(a.queueOrder || 9999);
            const bOrder = Number(b.queueOrder || 9999);
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            return String(a.name || "").localeCompare(String(b.name || ""));
        });
    const availableSales = rows
        .filter((row) => !Number(row.queueOrder) && !row.isSuspended)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const blockedSales = rows
        .filter((row) => row.isSuspended)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    return {
        queueRows,
        availableSales,
        blockedSales,
    };
}

export async function upsertSalesQueue(
    salesId: string,
    clientId: string,
    queueOrder: number,
    label: string
) {
    const now = new Date();
    await assertSalesNotSuspended(salesId, db, now);

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
                clientId,
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
            clientId,
            queueOrder,
            label,
            updatedAt: now,
        })
        .where(eq(salesQueue.id, existing.id))
        .returning();

    return updated;
}

export async function reorderSalesQueue(clientId: string, salesIds: string[]) {
    const orderedIds = Array.from(
        new Set((salesIds || []).filter((id) => typeof id === "string" && id.trim().length > 0))
    );

    if (orderedIds.length === 0) {
        throw new Error("INVALID_QUEUE_PAYLOAD");
    }

    await db.transaction(async (tx) => {
        const queueRows = await getActiveQueueRows(tx as unknown as DbExecutor, clientId);
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
            clientId,
            reorderedRows as Array<{ id: string }>
        );
    });

    return getDistributionQueue(clientId);
}

export async function addSalesToQueue(params: {
    clientId: string;
    salesId: string;
    queueOrder?: number | null;
}) {
    await db.transaction(async (tx) => {
        const executor = tx as unknown as DbExecutor;
        const salesRow = await getSalesRow(executor, params.salesId);

        if (!salesRow || salesRow.role !== "sales" || !salesRow.isActive) {
            throw new Error("INVALID_ASSIGNED_SALES");
        }

        if (salesRow.clientId !== params.clientId) {
            throw new Error("CROSS_CLIENT_ASSIGNMENT_FORBIDDEN");
        }

        await assertSalesNotSuspended(params.salesId, executor);

        const existingQueue = await getQueueRowBySalesId(executor, params.salesId);
        if (existingQueue?.isActive) {
            throw new Error("SALES_ALREADY_IN_QUEUE");
        }

        const currentQueue = await getActiveQueueRows(executor, params.clientId);
        const targetIndexRaw =
            typeof params.queueOrder === "number" && Number.isFinite(params.queueOrder)
                ? params.queueOrder - 1
                : currentQueue.length;
        const targetIndex = Math.max(0, Math.min(currentQueue.length, targetIndexRaw));
        const now = new Date();

        const queueId = existingQueue?.id || generateId();

        if (!existingQueue) {
            await executor.insert(salesQueue).values({
                id: queueId,
                salesId: params.salesId,
                clientId: params.clientId,
                queueOrder: (await getHighestQueueOrder(executor, params.clientId)) + 1,
                label: queueLabelFromOrder(currentQueue.length + 1),
                isActive: true,
                createdAt: now,
                updatedAt: now,
            });
        } else {
            await executor
                .update(salesQueue)
                .set({
                    clientId: params.clientId,
                    isActive: true,
                    updatedAt: now,
                })
                .where(eq(salesQueue.id, existingQueue.id));
        }

        const reorderedRows = [...currentQueue];
        reorderedRows.splice(targetIndex, 0, {
            id: queueId,
            salesId: params.salesId,
            queueOrder: targetIndex + 1,
            salesName: salesRow.name,
        });

        await resequenceQueue(
            executor,
            params.clientId,
            reorderedRows.map((row) => ({ id: row.id }))
        );
    });

    return getDistributionQueue(params.clientId);
}

async function removeSalesFromQueueWithExecutor(
    executor: DbExecutor,
    params: {
        clientId: string;
        salesId: string;
    }
) {
    const existingQueue = await getQueueRowBySalesId(executor, params.salesId);

    if (!existingQueue || !existingQueue.isActive || existingQueue.clientId !== params.clientId) {
        return false;
    }

    const nextInactiveOrder = (await getHighestQueueOrder(executor, params.clientId)) + 1;

    await executor
        .update(salesQueue)
        .set({
            isActive: false,
            queueOrder: nextInactiveOrder,
            updatedAt: new Date(),
        })
        .where(eq(salesQueue.id, existingQueue.id));

    const remainingQueue = (await getActiveQueueRows(executor, params.clientId)).filter(
        (row) => row.salesId !== params.salesId
    );

    await resequenceQueue(
        executor,
        params.clientId,
        remainingQueue.map((row) => ({ id: row.id }))
    );

    return true;
}

export async function removeSalesFromQueue(params: {
    clientId: string;
    salesId: string;
}) {
    await db.transaction(async (tx) => {
        const removed = await removeSalesFromQueueWithExecutor(tx as unknown as DbExecutor, params);
        if (!removed) {
            throw new Error("QUEUE_ITEM_NOT_FOUND");
        }
    });

    return getDistributionQueue(params.clientId);
}

export async function removeSalesFromQueueBySuspension(
    params: {
        clientId: string;
        salesId: string;
    },
    executor: DbExecutor = db
) {
    return removeSalesFromQueueWithExecutor(executor, params);
}

export async function rotateQueueAfterAssignment(
    acceptedSalesId: string,
    clientId: string,
    executor: DbExecutor = db
) {
    const queueRows = await getActiveQueueRows(executor, clientId);
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
        clientId,
        reorderedRows.map((row) => ({ id: row.id }))
    );

    return true;
}

export async function createSalesUser(data: {
    name: string;
    email: string;
    password: string;
    clientId: string;
    createdByUserId: string;
    supervisorId?: string | null;
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

    if (data.supervisorId) {
        const [supervisorRow] = await db
            .select({
                id: user.id,
                role: user.role,
                clientId: user.clientId,
            })
            .from(user)
            .where(eq(user.id, data.supervisorId))
            .limit(1);

        if (!supervisorRow || supervisorRow.role !== "supervisor") {
            throw new Error("INVALID_SUPERVISOR");
        }

        if (supervisorRow.clientId !== data.clientId) {
            throw new Error("CROSS_CLIENT_ASSIGNMENT_FORBIDDEN");
        }
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
            clientId: data.clientId,
            supervisorId: data.supervisorId || null,
            createdByUserId: data.createdByUserId,
            phone: data.phone ? normalizePhone(data.phone) : null,
            isActive: true,
            updatedAt: now,
        })
        .where(eq(user.id, createdUserId));

    let queue = null;
    if (typeof data.queueOrder === "number" && data.queueOrder > 0) {
        const queueState = await addSalesToQueue({
            salesId: createdUserId,
            clientId: data.clientId,
            queueOrder: data.queueOrder,
        });
        queue =
            queueState.queueRows.find((item) => item.id === createdUserId) ||
            queueState.queueRows.find((item) => item.email === normalizedEmail) ||
            null;
    }

    const [created] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, createdUserId))
        .limit(1);

    return {
        ...created,
        queueOrder: queue?.queueOrder || null,
        queueLabel: queue?.queueLabel || null,
    };
}

export async function assignSalesSupervisor(params: {
    salesIds: string[];
    supervisorId: string | null;
    clientId: string;
}) {
    const salesIds = Array.from(
        new Set(params.salesIds.filter((id) => typeof id === "string" && id.trim()))
    );

    if (salesIds.length === 0) {
        return [];
    }

    if (params.supervisorId) {
        const [supervisorRow] = await db
            .select({
                id: user.id,
                role: user.role,
                clientId: user.clientId,
            })
            .from(user)
            .where(eq(user.id, params.supervisorId))
            .limit(1);

        if (!supervisorRow || supervisorRow.role !== "supervisor") {
            throw new Error("INVALID_SUPERVISOR");
        }

        if (supervisorRow.clientId !== params.clientId) {
            throw new Error("CROSS_CLIENT_ASSIGNMENT_FORBIDDEN");
        }
    }

    const updated = await db
        .update(user)
        .set({
            supervisorId: params.supervisorId,
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(user.id, salesIds),
                eq(user.role, "sales"),
                eq(user.clientId, params.clientId)
            )
        )
        .returning({
            id: user.id,
            supervisorId: user.supervisorId,
        });

    return updated;
}
