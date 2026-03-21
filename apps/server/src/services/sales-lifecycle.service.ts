import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { salesQueue, session, user } from "../db/schema";
import { generateId } from "../utils/id";

type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = typeof db | TxExecutor;

type ActorScope = {
    actorId: string;
    actorRole: string;
    actorClientId?: string | null;
};

function queueLabelFromOrder(order: number) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (order >= 1 && order <= alphabet.length) {
        return alphabet[order - 1];
    }
    return `Q${order}`;
}

function getManagedSalesWhereClause(salesId: string, actor: ActorScope) {
    const conditions = [eq(user.id, salesId), eq(user.role, "sales")];

    if (actor.actorRole === "client_admin") {
        conditions.push(eq(user.clientId, actor.actorClientId || "__no_client__"));
    }

    return and(...conditions);
}

async function getManagedSalesRow(salesId: string, actor: ActorScope) {
    const [row] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
            deactivatedAt: user.deactivatedAt,
        })
        .from(user)
        .where(getManagedSalesWhereClause(salesId, actor))
        .limit(1);

    return row || null;
}

async function getHighestQueueOrder(executor: DbLike, clientId: string) {
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

async function getActiveQueueRows(executor: DbLike, clientId: string) {
    return executor
        .select({
            id: salesQueue.id,
            salesId: salesQueue.salesId,
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
}

async function resequenceActiveQueue(executor: DbLike, clientId: string) {
    const orderedRows = await getActiveQueueRows(executor, clientId);
    if (orderedRows.length === 0) {
        return;
    }

    const highestOrder = await getHighestQueueOrder(executor, clientId);
    const temporaryOrderBase = highestOrder + 1000;
    const now = new Date();

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

async function deactivateQueueMembership(executor: DbLike, clientId: string, salesId: string) {
    const [existingQueue] = await executor
        .select({
            id: salesQueue.id,
            clientId: salesQueue.clientId,
            isActive: salesQueue.isActive,
        })
        .from(salesQueue)
        .where(eq(salesQueue.salesId, salesId))
        .limit(1);

    if (!existingQueue || !existingQueue.isActive || existingQueue.clientId !== clientId) {
        return false;
    }

    const nextInactiveOrder = (await getHighestQueueOrder(executor, clientId)) + 1;

    await executor
        .update(salesQueue)
        .set({
            isActive: false,
            queueOrder: nextInactiveOrder,
            updatedAt: new Date(),
        })
        .where(eq(salesQueue.id, existingQueue.id));

    await resequenceActiveQueue(executor, clientId);
    return true;
}

async function activateQueueMembership(executor: DbLike, clientId: string, salesId: string) {
    const [existingQueue] = await executor
        .select({
            id: salesQueue.id,
            isActive: salesQueue.isActive,
        })
        .from(salesQueue)
        .where(eq(salesQueue.salesId, salesId))
        .limit(1);

    const now = new Date();
    const nextOrder = (await getHighestQueueOrder(executor, clientId)) + 1;

    if (!existingQueue) {
        await executor.insert(salesQueue).values({
            id: generateId(),
            salesId,
            clientId,
            queueOrder: nextOrder,
            label: queueLabelFromOrder(nextOrder),
            isActive: true,
            createdAt: now,
            updatedAt: now,
        });
    } else if (!existingQueue.isActive) {
        await executor
            .update(salesQueue)
            .set({
                clientId,
                isActive: true,
                queueOrder: nextOrder,
                updatedAt: now,
            })
            .where(eq(salesQueue.id, existingQueue.id));
    }

    await resequenceActiveQueue(executor, clientId);
    return true;
}

function mapSalesUserResponse(row: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    clientId: string | null;
    supervisorId: string | null;
    isActive: boolean;
    deactivatedAt?: Date | null;
}) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        clientId: row.clientId,
        supervisorId: row.supervisorId,
        isActive: row.isActive,
        deactivatedAt: row.deactivatedAt || null,
    };
}

export async function deactivateSalesUser(salesId: string, actor: ActorScope) {
    const salesRow = await getManagedSalesRow(salesId, actor);
    if (!salesRow) {
        throw new Error("SALES_NOT_FOUND");
    }

    if (!salesRow.clientId) {
        throw new Error("SALES_CLIENT_NOT_FOUND");
    }

    if (!salesRow.isActive) {
        return mapSalesUserResponse(salesRow);
    }

    return db.transaction(async (tx) => {
        await deactivateQueueMembership(tx, salesRow.clientId!, salesRow.id);
        await tx.delete(session).where(eq(session.userId, salesRow.id));

        const [updated] = await tx
            .update(user)
            .set({
                isActive: false,
                deactivatedAt: new Date(),
                deactivatedByUserId: actor.actorId,
                reactivatedAt: null,
                reactivatedByUserId: null,
                updatedAt: new Date(),
            })
            .where(eq(user.id, salesRow.id))
            .returning({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                clientId: user.clientId,
                supervisorId: user.supervisorId,
                isActive: user.isActive,
                deactivatedAt: user.deactivatedAt,
            });

        if (!updated) {
            throw new Error("SALES_NOT_FOUND");
        }

        return mapSalesUserResponse(updated);
    });
}

export async function reactivateSalesUser(salesId: string, actor: ActorScope) {
    const salesRow = await getManagedSalesRow(salesId, actor);
    if (!salesRow) {
        throw new Error("SALES_NOT_FOUND");
    }

    if (!salesRow.clientId) {
        throw new Error("SALES_CLIENT_NOT_FOUND");
    }

    return db.transaction(async (tx) => {
        const [updated] = await tx
            .update(user)
            .set({
                isActive: true,
                reactivatedAt: new Date(),
                reactivatedByUserId: actor.actorId,
                updatedAt: new Date(),
            })
            .where(eq(user.id, salesRow.id))
            .returning({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                clientId: user.clientId,
                supervisorId: user.supervisorId,
                isActive: user.isActive,
                deactivatedAt: user.deactivatedAt,
            });

        if (!updated) {
            throw new Error("SALES_NOT_FOUND");
        }

        await activateQueueMembership(tx, salesRow.clientId!, salesRow.id);
        return mapSalesUserResponse(updated);
    });
}
