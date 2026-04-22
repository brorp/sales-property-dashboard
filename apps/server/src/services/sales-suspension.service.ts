import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "../db/index";
import { dailyTaskPenalty, dailyTaskPenaltySuspension } from "../db/schema";
import { generateId } from "../utils/id";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateSuspensionParams = {
    salesId: string;
    clientId?: string | null;
    penaltyId: string;
    durationHours: number;
    suspendedFrom?: Date;
};

export async function markExpiredSalesSuspensions(
    executor: DbExecutor = db,
    now: Date = new Date()
) {
    await executor
        .update(dailyTaskPenaltySuspension)
        .set({
            status: "expired",
            updatedAt: now,
        })
        .where(
            and(
                eq(dailyTaskPenaltySuspension.status, "active"),
                lte(dailyTaskPenaltySuspension.suspendedUntil, now)
            )
        );

    await executor
        .update(dailyTaskPenalty)
        .set({
            status: "expired",
            updatedAt: now,
        })
        .where(
            and(
                eq(dailyTaskPenalty.status, "active"),
                lte(dailyTaskPenalty.blockedUntil, now)
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
        .select({
            id: dailyTaskPenaltySuspension.id,
            salesId: dailyTaskPenaltySuspension.salesId,
            clientId: dailyTaskPenaltySuspension.clientId,
            penaltyId: dailyTaskPenaltySuspension.penaltyId,
            status: dailyTaskPenaltySuspension.status,
            durationHours: dailyTaskPenaltySuspension.durationHours,
            suspendedFrom: dailyTaskPenaltySuspension.suspendedFrom,
            suspendedUntil: dailyTaskPenaltySuspension.suspendedUntil,
            createdAt: dailyTaskPenaltySuspension.createdAt,
            updatedAt: dailyTaskPenaltySuspension.updatedAt,
            penaltySequence: dailyTaskPenalty.penaltySequence,
            spLevel: dailyTaskPenalty.spLevel,
            reason: dailyTaskPenalty.reason,
            penaltyLayer: dailyTaskPenalty.penaltySequence,
            suspendedDays: dailyTaskPenaltySuspension.durationHours,
            ruleCode: dailyTaskPenalty.reason,
        })
        .from(dailyTaskPenaltySuspension)
        .innerJoin(
            dailyTaskPenalty,
            eq(dailyTaskPenaltySuspension.penaltyId, dailyTaskPenalty.id)
        )
        .where(
            and(
                inArray(dailyTaskPenaltySuspension.salesId, salesIds),
                eq(dailyTaskPenaltySuspension.status, "active"),
                eq(dailyTaskPenalty.status, "active"),
                gt(dailyTaskPenaltySuspension.suspendedUntil, now)
            )
        )
        .orderBy(desc(dailyTaskPenaltySuspension.suspendedUntil));
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
    const durationHours = Math.max(1, Number(params.durationHours || 0));
    const suspendedUntil = new Date(
        suspendedFrom.getTime() + durationHours * 60 * 60 * 1000
    );

    const [inserted] = await executor
        .insert(dailyTaskPenaltySuspension)
        .values({
            id: generateId(),
            salesId: params.salesId,
            clientId: params.clientId || null,
            penaltyId: params.penaltyId,
            suspendedFrom,
            suspendedUntil,
            durationHours,
            status: "active",
            createdAt: suspendedFrom,
            updatedAt: suspendedFrom,
        })
        .onConflictDoNothing()
        .returning();

    if (!inserted) {
        const [existing] = await executor
            .select()
            .from(dailyTaskPenaltySuspension)
            .where(eq(dailyTaskPenaltySuspension.penaltyId, params.penaltyId))
            .limit(1);
        return existing || null;
    }

    return inserted;
}
