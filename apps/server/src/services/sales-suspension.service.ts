import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "../db/index";
import { salesDistributionSuspension } from "../db/schema";
import { generateId } from "../utils/id";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateSuspensionParams = {
    salesId: string;
    clientId?: string | null;
    penaltyId: string;
    ruleCode: string;
    penaltyLayer: number;
    suspendedDays: number;
    note?: string | null;
    suspendedFrom?: Date;
};

export async function markExpiredSalesSuspensions(
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    await executor
        .update(salesDistributionSuspension)
        .set({
            status: "completed",
            updatedAt: now,
        })
        .where(
            and(
                eq(salesDistributionSuspension.status, "active"),
                lte(salesDistributionSuspension.suspendedUntil, now)
            )
        );
}

export async function getActiveSalesSuspensionRows(
    salesIds: string[],
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    if (salesIds.length === 0) {
        return [];
    }

    await markExpiredSalesSuspensions(executor, now);

    return executor
        .select()
        .from(salesDistributionSuspension)
        .where(
            and(
                inArray(salesDistributionSuspension.salesId, salesIds),
                eq(salesDistributionSuspension.status, "active"),
                gt(salesDistributionSuspension.suspendedUntil, now)
            )
        )
        .orderBy(desc(salesDistributionSuspension.suspendedUntil));
}

export async function getActiveSalesSuspensionMap(
    salesIds: string[],
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const rows = await getActiveSalesSuspensionRows(salesIds, executor, now);
    const map = new Map<string, typeof rows[number]>();

    for (const row of rows) {
        const existing = map.get(row.salesId);
        if (!existing || row.suspendedUntil.getTime() > existing.suspendedUntil.getTime()) {
            map.set(row.salesId, row);
        }
    }

    return map;
}

export async function getActiveSalesSuspension(
    salesId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const map = await getActiveSalesSuspensionMap([salesId], executor, now);
    return map.get(salesId) || null;
}

export async function assertSalesNotSuspended(
    salesId: string,
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    const suspension = await getActiveSalesSuspension(salesId, executor, now);
    if (suspension) {
        throw new Error("SALES_SUSPENDED_FROM_QUEUE");
    }

    return null;
}

export async function createSalesSuspension(
    params: CreateSuspensionParams,
    executor: DbExecutor = db
) {
    const suspendedFrom = params.suspendedFrom || new Date();
    const suspendedUntil = new Date(
        suspendedFrom.getTime() + Math.max(1, params.suspendedDays) * 24 * 60 * 60 * 1000
    );

    const [inserted] = await executor
        .insert(salesDistributionSuspension)
        .values({
            id: generateId(),
            salesId: params.salesId,
            clientId: params.clientId || null,
            penaltyId: params.penaltyId,
            ruleCode: params.ruleCode,
            penaltyLayer: params.penaltyLayer,
            suspendedDays: params.suspendedDays,
            status: "active",
            note: params.note || null,
            suspendedFrom,
            suspendedUntil,
            createdAt: suspendedFrom,
            updatedAt: suspendedFrom,
        })
        .onConflictDoNothing()
        .returning();

    if (!inserted) {
        const [existing] = await executor
            .select()
            .from(salesDistributionSuspension)
            .where(eq(salesDistributionSuspension.penaltyId, params.penaltyId))
            .limit(1);
        return existing || null;
    }

    return inserted;
}
