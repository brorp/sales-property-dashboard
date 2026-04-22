import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { activity, customerPipelineFollowUp, lead, leadPenalty, user } from "../db/schema";
import { createSalesSuspension } from "../services/sales-suspension.service";
import { removeSalesFromQueueBySuspension } from "../services/sales.service";
import { generateId } from "../utils/id";
import {
    CUSTOMER_PIPELINE_RULE_CODE,
    CUSTOMER_PIPELINE_STEP_COUNT,
    getCustomerPipelineSuspensionDays,
    isCustomerPipelinePenaltyDue,
    resolveCustomerPipelinePenaltyLayer,
} from "../utils/lead-workflow";
import { logger } from "../utils/logger";

const POLL_INTERVAL_MS = Number(process.env.CUSTOMER_PIPELINE_PENALTY_POLL_MS || 60_000);
const PENALTY_TIMEZONE = process.env.CUSTOMER_PIPELINE_PENALTY_TIMEZONE || "Asia/Jakarta";
const PENALTY_HOUR = Number(process.env.CUSTOMER_PIPELINE_PENALTY_HOUR || 0);

let timer: NodeJS.Timeout | null = null;
let lastRunDateKey: string | null = null;

function getZonedParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const map = new Map(parts.map((part) => [part.type, part.value]));

    return {
        year: map.get("year") || "0000",
        month: map.get("month") || "01",
        day: map.get("day") || "01",
        hour: Number(map.get("hour") || 0),
    };
}

function toDateKey(parts: { year: string; month: string; day: string }) {
    return `${parts.year}-${parts.month}-${parts.day}`;
}

async function createCustomerPipelinePenalties() {
    const candidateLeads = await db
        .select({
            id: lead.id,
            acceptedAt: lead.acceptedAt,
            createdAt: lead.createdAt,
            salesStatus: lead.salesStatus,
            assignedTo: lead.assignedTo,
            clientId: lead.clientId,
            salesName: user.name,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(
            and(
                eq(lead.flowStatus, "accepted"),
                eq(lead.salesStatus, "warm")
            )
        )
        .orderBy(desc(lead.acceptedAt), desc(lead.createdAt));

    if (candidateLeads.length === 0) {
        return 0;
    }

    const leadIds = candidateLeads.map((row) => row.id);
    const salesIds = Array.from(
        new Set(
            candidateLeads
                .map((row) => row.assignedTo)
                .filter((value): value is string => Boolean(value))
        )
    );

    const [existingPenalties, followUps, priorSalesPenalties] = await Promise.all([
        db
            .select({
                leadId: leadPenalty.leadId,
            })
            .from(leadPenalty)
            .where(
                and(
                    inArray(leadPenalty.leadId, leadIds),
                    eq(leadPenalty.ruleCode, CUSTOMER_PIPELINE_RULE_CODE)
                )
            ),
        db
            .select({
                leadId: customerPipelineFollowUp.leadId,
                isChecked: customerPipelineFollowUp.isChecked,
            })
            .from(customerPipelineFollowUp)
            .where(inArray(customerPipelineFollowUp.leadId, leadIds)),
        salesIds.length > 0
            ? db
                .select({
                    salesId: leadPenalty.salesId,
                })
                .from(leadPenalty)
                .where(
                    and(
                        inArray(leadPenalty.salesId, salesIds),
                        eq(leadPenalty.ruleCode, CUSTOMER_PIPELINE_RULE_CODE)
                    )
                )
            : Promise.resolve([]),
    ]);

    const existingPenaltyLeadIds = new Set(existingPenalties.map((row) => row.leadId));
    const checkedCountMap = new Map<string, number>();
    const salesPenaltyCountMap = new Map<string, number>();

    for (const row of followUps) {
        if (!row.isChecked) {
            continue;
        }
        checkedCountMap.set(row.leadId, (checkedCountMap.get(row.leadId) || 0) + 1);
    }

    for (const row of priorSalesPenalties) {
        if (!row.salesId) {
            continue;
        }
        salesPenaltyCountMap.set(
            row.salesId,
            (salesPenaltyCountMap.get(row.salesId) || 0) + 1
        );
    }

    let createdCount = 0;

    for (const candidate of candidateLeads) {
        if (existingPenaltyLeadIds.has(candidate.id)) {
            continue;
        }

        if (!candidate.assignedTo || !candidate.clientId) {
            continue;
        }

        const salesId = candidate.assignedTo;
        const clientId = candidate.clientId;

        const checkedCount = checkedCountMap.get(candidate.id) || 0;
        const due = isCustomerPipelinePenaltyDue({
            acceptedAt: candidate.acceptedAt || candidate.createdAt,
            salesStatus: candidate.salesStatus,
            checkedCount,
        });

        if (!due) {
            continue;
        }

        const now = new Date();
        const previousPenaltyCount = salesPenaltyCountMap.get(salesId) || 0;
        const penaltyLayer = resolveCustomerPipelinePenaltyLayer(previousPenaltyCount);
        const suspendedDays = getCustomerPipelineSuspensionDays(penaltyLayer);
        const salesLabel = candidate.salesName || "Sales";
        const note = `Penalty dibuat karena Customer Pipeline belum lengkap ${checkedCount}/${CUSTOMER_PIPELINE_STEP_COUNT} dalam 14 hari dan lead masih Warm`;
        const queueNote = `Penalty layer ${penaltyLayer} diberikan ke ${salesLabel}, distribution queue dinonaktifkan selama ${suspendedDays} hari`;
        let inserted = false;

        await db.transaction(async (tx) => {
            const [insertedPenalty] = await tx
                .insert(leadPenalty)
                .values({
                    id: generateId(),
                    leadId: candidate.id,
                    salesId,
                    ruleCode: CUSTOMER_PIPELINE_RULE_CODE,
                    penaltyLayer,
                    suspendedDays,
                    status: "active",
                    note,
                    metadata: JSON.stringify({
                        checkedCount,
                        requiredSteps: CUSTOMER_PIPELINE_STEP_COUNT,
                        penaltyLayer,
                        suspendedDays,
                    }),
                    triggeredAt: now,
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoNothing()
                .returning({
                    id: leadPenalty.id,
                });

            if (!insertedPenalty) {
                return;
            }

            inserted = true;

            await createSalesSuspension({
                salesId,
                clientId,
                penaltyId: insertedPenalty.id,
                durationHours: suspendedDays * 24,
                suspendedFrom: now,
            }, tx);

            await tx.insert(activity).values({
                id: generateId(),
                leadId: candidate.id,
                type: "penalty",
                note,
                timestamp: now,
            });

            await tx.insert(activity).values({
                id: generateId(),
                leadId: candidate.id,
                type: "penalty",
                note: queueNote,
                timestamp: now,
            });

            const removedFromQueue = await removeSalesFromQueueBySuspension({
                clientId,
                salesId,
            }, tx);

            if (removedFromQueue) {
                await tx.insert(activity).values({
                    id: generateId(),
                    leadId: candidate.id,
                    type: "distribution",
                    note: `${salesLabel} dikeluarkan dari distribution queue karena penalty aktif`,
                    timestamp: now,
                });
            }
        });

        if (!inserted) {
            continue;
        }

        existingPenaltyLeadIds.add(candidate.id);
        salesPenaltyCountMap.set(salesId, previousPenaltyCount + 1);
        createdCount += 1;
    }

    return createdCount;
}

async function tick() {
    const now = new Date();
    const parts = getZonedParts(now, PENALTY_TIMEZONE);
    const dateKey = toDateKey(parts);

    if (parts.hour !== PENALTY_HOUR || lastRunDateKey === dateKey) {
        return;
    }

    try {
        const createdCount = await createCustomerPipelinePenalties();
        lastRunDateKey = dateKey;
        logger.info("[customer-pipeline-penalty-worker] completed", {
            dateKey,
            createdCount,
            timeZone: PENALTY_TIMEZONE,
        });
    } catch (error) {
        logger.error("[customer-pipeline-penalty-worker] failed", {
            dateKey,
            error,
        });
    }
}

export function startCustomerPipelinePenaltyWorker() {
    if (timer) {
        return;
    }

    timer = setInterval(() => {
        void tick();
    }, POLL_INTERVAL_MS);

    logger.info("[customer-pipeline-penalty-worker] started", {
        pollMs: POLL_INTERVAL_MS,
        hour: PENALTY_HOUR,
        timeZone: PENALTY_TIMEZONE,
    });

    void tick();
}

export function stopCustomerPipelinePenaltyWorker() {
    if (!timer) {
        return;
    }

    clearInterval(timer);
    timer = null;
}
