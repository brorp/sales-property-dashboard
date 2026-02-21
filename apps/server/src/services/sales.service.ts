import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { salesQueue, user } from "../db/schema";
import { generateId } from "../utils/id";

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
