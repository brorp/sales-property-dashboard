import { and, asc, desc, eq, lte, ne } from "drizzle-orm";
import { db } from "../db/index";
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
import { sendWhatsAppText } from "./whatsapp-provider.service";
import { getDistributionAckTimeoutMs } from "./system-settings.service";
import { getActiveWhatsAppNumber } from "./whatsapp-identity.service";
import { moveSalesToQueueEnd } from "./sales.service";
import { getActiveSalesSuspensionMap } from "./sales-suspension.service";
import { createNewLeadTaskForLead } from "./daily-task.service";
import { sendToUser, sendToUsers } from "./push-notification.service";
import { ensureLeadCode } from "./lead-code.service";

type DbExecutor = typeof db;

interface QueueEntry {
    salesId: string;
    queueOrder: number;
    repeatOrderRemaining: number;
    salesName: string;
    salesPhone: string | null;
}

function toWaMeLink(phone: string | null | undefined) {
    if (!phone) {
        return "-";
    }
    const digits = phone.replace(/[^\d]/g, "");
    return digits ? `https://wa.me/${digits}` : "-";
}

function buildClaimOfferMessage(params: {
    leadCode: string;
    timeoutMinutes: number;
}) {
    return [
        `[lid] ${params.leadCode}`,
        "Leads baru masuk.",
        `Balas "OK" dalam ${params.timeoutMinutes} menit untuk claim.`,
        "Detail lead akan dikirim setelah claim berhasil.",
    ].join("\n");
}

function buildClaimSuccessLeadMessage(params: {
    leadName: string | null | undefined;
    leadPhone: string | null | undefined;
}) {
    return [
        "Claim berhasil.",
        `Nama: ${params.leadName || "-"}`,
        `WA: ${params.leadPhone || "-"}`,
        `Chat: ${toWaMeLink(params.leadPhone)}`,
        "Lead sudah masuk dashboard Anda.",
    ].join("\n");
}

async function getNextQueueEntry(
    executor: DbExecutor,
    clientId: string,
    cycleId: string
): Promise<QueueEntry | null> {
    const attemptedRows = await executor
        .select({
            salesId: distributionAttempt.salesId,
        })
        .from(distributionAttempt)
        .where(eq(distributionAttempt.cycleId, cycleId))
        .orderBy(asc(distributionAttempt.assignedAt), asc(distributionAttempt.queueOrder));

    const attemptedSalesIds = new Set(attemptedRows.map((row) => row.salesId));
    const rows = await executor
        .select({
            salesId: salesQueue.salesId,
            queueOrder: salesQueue.queueOrder,
            repeatOrderRemaining: salesQueue.repeatOrderRemaining,
            salesName: user.name,
            salesPhone: user.phone,
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
        .orderBy(asc(salesQueue.queueOrder))
        .limit(50);

    const suspensionMap = await getActiveSalesSuspensionMap(
        rows.map((row) => row.salesId),
        executor
    );
    const liveOfferRows = await executor
        .select({
            salesId: distributionAttempt.salesId,
        })
        .from(distributionAttempt)
        .innerJoin(distributionCycle, eq(distributionAttempt.cycleId, distributionCycle.id))
        .innerJoin(lead, eq(distributionAttempt.leadId, lead.id))
        .where(
            and(
                eq(distributionCycle.status, "active"),
                eq(lead.clientId, clientId),
                eq(distributionAttempt.status, "waiting_ok"),
                ne(distributionAttempt.cycleId, cycleId)
            )
        );
    const liveOfferSalesIds = new Set(liveOfferRows.map((row) => row.salesId));

    return (
        rows.find(
            (row) =>
                !suspensionMap.has(row.salesId) &&
                !attemptedSalesIds.has(row.salesId) &&
                (
                    Number(row.repeatOrderRemaining || 0) > 0 ||
                    !liveOfferSalesIds.has(row.salesId)
                )
        ) ?? null
    );
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
    clientId: string
) {
    const [cycle] = await executor
        .select({
            status: distributionCycle.status,
            cycleLeadId: distributionCycle.leadId,
        })
        .from(distributionCycle)
        .where(eq(distributionCycle.id, cycleId))
        .limit(1);

    if (!cycle || cycle.status !== "active") {
        return null;
    }

    if (cycle.cycleLeadId !== leadId) {
        await logDistributionActivity(
            executor,
            leadId,
            "note",
            "Distribusi dilewati: cycle tidak cocok dengan lead."
        );
        return null;
    }

    const [leadScope] = await executor
        .select({
            clientId: lead.clientId,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    if (!leadScope?.clientId || leadScope.clientId !== clientId) {
        await logDistributionActivity(
            executor,
            leadId,
            "note",
            `Distribusi dilewati: workspace lead tidak cocok dengan worker/queue (${leadScope?.clientId || "-"} != ${clientId}).`
        );
        return null;
    }

    const activeWaitingAttempts = await executor
        .select({ id: distributionAttempt.id })
        .from(distributionAttempt)
        .where(
            and(
                eq(distributionAttempt.cycleId, cycleId),
                eq(distributionAttempt.status, "waiting_ok")
            )
        )
        .limit(1);

    if (activeWaitingAttempts.length > 0) {
        await logDistributionActivity(
            executor,
            leadId,
            "note",
            "Distribusi dilewati: masih ada offer aktif yang menunggu OK."
        );
        return null;
    }

    const next = await getNextQueueEntry(executor, clientId, cycleId);
    const now = new Date();

    if (!next) {
        await executor
            .update(distributionCycle)
            .set({
                status: "exhausted",
                finishedAt: now,
            })
            .where(eq(distributionCycle.id, cycleId));

        await executor
            .update(lead)
            .set({
                assignedTo: null,
                flowStatus: "open",
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        await logDistributionActivity(
            executor,
            leadId,
            "note",
            "Distribusi berhenti: semua antrian sales sudah timeout. Lead dinyatakan hangus."
        );

        return null;
    }

    const ackTimeoutMs = await getDistributionAckTimeoutMs(clientId);
    const ackTimeoutMinutes = Math.max(1, Math.round(ackTimeoutMs / 60_000));
    const initialAckDeadline = new Date(now.getTime() + ackTimeoutMs);

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
            ackDeadline: initialAckDeadline,
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
            assignedTo: null,
            flowStatus: "open",
            updatedAt: now,
        })
        .where(eq(lead.id, leadId));

    const repeatOrderRemaining = Math.max(0, Number(next.repeatOrderRemaining || 0));
    const leadCode = await ensureLeadCode(leadId, executor);
    const messageBody = buildClaimOfferMessage({
        leadCode,
        timeoutMinutes: ackTimeoutMinutes,
    });

    const outboundResult = next.salesPhone
        ? await sendWhatsAppText(next.salesPhone, messageBody)
        : {
              sent: false,
              provider: (process.env.WA_PROVIDER || "dummy") as
                  | "dummy"
                  | "cloud_api"
                  | "qr_local",
              error: "Sales phone is empty",
          };

    await executor.insert(waMessage).values({
        id: generateId(),
        providerMessageId: outboundResult.providerMessageId || null,
        fromWa: getActiveWhatsAppNumber(),
        toWa: next.salesPhone || `sales:${next.salesId}`,
        body: outboundResult.sent
            ? messageBody
            : `${messageBody}\n\n[send_error] ${outboundResult.error || "unknown"}`,
        direction: "outbound_to_sales",
        leadId,
        salesId: next.salesId,
        createdAt: now,
    });

    if (!outboundResult.sent) {
        await executor
            .update(distributionAttempt)
            .set({
                status: "closed",
                closedAt: new Date(),
                closeReason: "send_failed",
            })
            .where(eq(distributionAttempt.id, attempt.id));

        await logDistributionActivity(
            executor,
            leadId,
            "note",
            `Offer distribusi ke ${next.salesName} gagal dikirim (${outboundResult.error || "unknown error"}). Sistem lanjut ke antrian berikutnya.`
        );

        return assignNextQueue(executor, cycleId, leadId, clientId);
    }

    const sentAt = new Date();
    const ackDeadline = new Date(sentAt.getTime() + ackTimeoutMs);
    await executor
        .update(distributionAttempt)
        .set({
            ackDeadline,
        })
        .where(eq(distributionAttempt.id, attempt.id));

    const queueRolled = repeatOrderRemaining > 0
        ? false
        : await moveSalesToQueueEnd(
            next.salesId,
            clientId,
            executor
        );

    await logDistributionActivity(
        executor,
        leadId,
        "note",
        `Lead didistribusikan ke ${next.salesName} (urutan ${next.queueOrder}), tunggu ACK OK hingga ${ackDeadline.toISOString()}.`
    );

    if (queueRolled) {
        await logDistributionActivity(
            executor,
            leadId,
            "note",
            `Urutan sesi berikutnya langsung dirotasi setelah offer dikirim ke ${next.salesName}.`
        );
    } else if (repeatOrderRemaining > 0) {
        await logDistributionActivity(
            executor,
            leadId,
            "note",
            `${next.salesName} memiliki reward repeat order ${repeatOrderRemaining}x. Queue ditahan sampai sales membalas OK atau timeout.`
        );
    }

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
    const [leadRow] = await db
        .select({
            clientId: lead.clientId,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    if (!leadRow?.clientId) {
        throw new Error("LEAD_CLIENT_NOT_FOUND");
    }

    const latestCycle = await getLatestCycleByLead(leadId);

    if (latestCycle) {
        if (
            latestCycle.status === "active" ||
            latestCycle.status === "accepted" ||
            latestCycle.status === "exhausted"
        ) {
            return latestCycle;
        }
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

    await assignNextQueue(db, cycle.id, leadId, leadRow.clientId);
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
    messageBody: string,
    clientId?: string | null
) {
    if (messageBody.trim().toLowerCase() !== "ok") {
        return { accepted: false, reason: "message_not_ok" as const };
    }

    if (clientId) {
        const [leadScope] = await db
            .select({ clientId: lead.clientId })
            .from(lead)
            .where(eq(lead.id, leadId))
            .limit(1);

        if (!leadScope || leadScope.clientId !== clientId) {
            return { accepted: false, reason: "client_scope_mismatch" as const };
        }
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
        const [latestAttempt] = await db
            .select({
                status: distributionAttempt.status,
                closeReason: distributionAttempt.closeReason,
                ackDeadline: distributionAttempt.ackDeadline,
            })
            .from(distributionAttempt)
            .where(
                and(
                    eq(distributionAttempt.leadId, leadId),
                    eq(distributionAttempt.salesId, salesId)
                )
            )
            .orderBy(desc(distributionAttempt.assignedAt))
            .limit(1);

        if (
            latestAttempt?.status === "timeout" &&
            latestAttempt.closeReason === "ack_timeout_5m"
        ) {
            return {
                accepted: false,
                reason: "late_timeout" as const,
                ackDeadline: latestAttempt.ackDeadline,
            };
        }

        if (latestAttempt?.status === "accepted") {
            return {
                accepted: false,
                reason: "already_accepted" as const,
            };
        }

        return { accepted: false, reason: "no_waiting_attempt" as const };
    }

    const now = new Date();

    await db.transaction(async (tx) => {
        const [leadRow] = await tx
            .select({
                clientId: lead.clientId,
                name: lead.name,
                phone: lead.phone,
            })
            .from(lead)
            .where(eq(lead.id, leadId))
            .limit(1);

        if (!leadRow?.clientId) {
            throw new Error("LEAD_CLIENT_NOT_FOUND");
        }

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
                flowStatus: "assigned",
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        await createNewLeadTaskForLead({
            leadId,
            salesId,
            clientId: leadRow.clientId,
            assignedAt: now,
            executor: tx as unknown as DbExecutor,
        });

        void sendToUser(salesId, {
            title: "Lead Baru Masuk",
            body: `${leadRow.name} (${leadRow.phone}) telah ditugaskan ke kamu.`,
            data: { leadId, type: "new_lead" },
        });

        const [queueRewardRow] = await tx
            .select({
                id: salesQueue.id,
                repeatOrderRemaining: salesQueue.repeatOrderRemaining,
                salesName: user.name,
            })
            .from(salesQueue)
            .innerJoin(user, eq(salesQueue.salesId, user.id))
            .where(
                and(
                    eq(salesQueue.salesId, salesId),
                    eq(salesQueue.clientId, leadRow.clientId),
                    eq(salesQueue.isActive, true)
                )
            )
            .limit(1);

        const rewardBeforeClaim = Math.max(
            0,
            Number(queueRewardRow?.repeatOrderRemaining || 0)
        );
        if (queueRewardRow && rewardBeforeClaim > 0) {
            await logDistributionActivity(
                tx as unknown as DbExecutor,
                leadId,
                "note",
                `Reward repeat order ${queueRewardRow.salesName} tetap aktif ${rewardBeforeClaim}x setelah claim berhasil.`
            );
        }

        await tx
            .update(distributionAttempt)
            .set({
                status: "closed",
                closedAt: now,
                closeReason: "accepted_by_other",
            })
            .where(
                and(
                    eq(distributionAttempt.leadId, leadId),
                    eq(distributionAttempt.status, "waiting_ok"),
                    ne(distributionAttempt.id, waitingAttempt.id)
                )
            );

        await logDistributionActivity(
            tx as unknown as DbExecutor,
            leadId,
            "note",
            `Lead di-claim sales ${salesId} dengan balasan OK.`
        );
    });

    const [leadInfo] = await db
        .select({
            name: lead.name,
            phone: lead.phone,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    return {
        accepted: true,
        reason: "accepted" as const,
        claimLeadMessage: buildClaimSuccessLeadMessage({
            leadName: leadInfo?.name,
            leadPhone: leadInfo?.phone,
        }),
    };
}

async function timeoutAttemptAndRoll(
    attemptId: string,
    clientId?: string | null
) {
    return db.transaction(async (tx) => {
        const now = new Date();
        const [attempt] = await tx
            .update(distributionAttempt)
            .set({
                status: "timeout",
                closedAt: now,
                closeReason: "ack_timeout_5m",
            })
            .where(
                and(
                    eq(distributionAttempt.id, attemptId),
                    eq(distributionAttempt.status, "waiting_ok"),
                    lte(distributionAttempt.ackDeadline, now)
                )
            )
            .returning();

        if (!attempt) {
            return false;
        }

        const [cycle] = await tx
            .select({
                status: distributionCycle.status,
            })
            .from(distributionCycle)
            .where(eq(distributionCycle.id, attempt.cycleId))
            .limit(1);

        if (!cycle || cycle.status !== "active") {
            await tx
                .update(distributionAttempt)
                .set({
                    status: "closed",
                    closedAt: new Date(),
                    closeReason: "cycle_closed",
                })
                .where(eq(distributionAttempt.id, attempt.id));
            return false;
        }

        const [leadRow] = await tx
            .select({
                clientId: lead.clientId,
            })
            .from(lead)
            .where(eq(lead.id, attempt.leadId))
            .limit(1);

        if (!leadRow?.clientId) {
            throw new Error("LEAD_CLIENT_NOT_FOUND");
        }

        if (clientId && leadRow.clientId !== clientId) {
            await tx
                .update(distributionAttempt)
                .set({
                    status: "closed",
                    closedAt: now,
                    closeReason: "client_scope_mismatch",
                })
                .where(eq(distributionAttempt.id, attempt.id));

            await logDistributionActivity(
                tx as unknown as DbExecutor,
                attempt.leadId,
                "note",
                `Timeout distribusi dilewati: workspace attempt ${leadRow.clientId} tidak cocok dengan worker ${clientId}.`
            );

            return false;
        }

        await logDistributionActivity(
            tx as unknown as DbExecutor,
            attempt.leadId,
            "note",
            `Sales ${attempt.salesId} timeout (tidak membalas OK sebelum deadline).`
        );

        const [queueRewardRow] = await tx
            .select({
                id: salesQueue.id,
                repeatOrderRemaining: salesQueue.repeatOrderRemaining,
                salesName: user.name,
            })
            .from(salesQueue)
            .innerJoin(user, eq(salesQueue.salesId, user.id))
            .where(
                and(
                    eq(salesQueue.salesId, attempt.salesId),
                    eq(salesQueue.clientId, leadRow.clientId),
                    eq(salesQueue.isActive, true)
                )
            )
            .limit(1);

        const rewardBeforeTimeout = Math.max(
            0,
            Number(queueRewardRow?.repeatOrderRemaining || 0)
        );
        if (queueRewardRow && rewardBeforeTimeout > 0) {
            const queueRolledAfterRewardTimeout = await moveSalesToQueueEnd(
                attempt.salesId,
                leadRow.clientId,
                tx as unknown as DbExecutor
            );

            await logDistributionActivity(
                tx as unknown as DbExecutor,
                attempt.leadId,
                "note",
                `Reward repeat order ${queueRewardRow.salesName} tetap aktif ${rewardBeforeTimeout}x meski timeout. Sales dipindahkan ke bawah queue${queueRolledAfterRewardTimeout ? "" : " bila masih eligible"}.`
            );
        }

        await assignNextQueue(
            tx as unknown as DbExecutor,
            attempt.cycleId,
            attempt.leadId,
            leadRow.clientId
        );

        return true;
    });
}

export async function processExpiredAttempts(clientId?: string | null) {
    const now = new Date();
    const attempts = await db
        .select({ id: distributionAttempt.id })
        .from(distributionAttempt)
        .innerJoin(lead, eq(distributionAttempt.leadId, lead.id))
        .where(
            and(
                eq(distributionAttempt.status, "waiting_ok"),
                lte(distributionAttempt.ackDeadline, now),
                clientId ? eq(lead.clientId, clientId) : undefined
            )
        )
        .orderBy(asc(distributionAttempt.ackDeadline))
        .limit(100);

    let processed = 0;
    for (const attempt of attempts) {
        const didProcess = await timeoutAttemptAndRoll(attempt.id, clientId || null);
        if (didProcess) {
            processed += 1;
        }
    }

    return processed;
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

export async function stopAllActiveDistributions(clientId?: string | null) {
    const now = new Date();
    const activeCycles = await db
        .select({
            id: distributionCycle.id,
            leadId: distributionCycle.leadId,
            currentQueueOrder: distributionCycle.currentQueueOrder,
        })
        .from(distributionCycle)
        .innerJoin(lead, eq(distributionCycle.leadId, lead.id))
        .where(
            and(
                eq(distributionCycle.status, "active"),
                clientId ? eq(lead.clientId, clientId) : undefined
            )
        )
        .orderBy(desc(distributionCycle.startedAt))
        .limit(500);

    for (const cycle of activeCycles) {
        await db.transaction(async (tx) => {
            await tx
                .update(distributionAttempt)
                .set({
                    status: "closed",
                    closedAt: now,
                    closeReason: "manual_stop_admin",
                })
                .where(
                    and(
                        eq(distributionAttempt.cycleId, cycle.id),
                        eq(distributionAttempt.status, "waiting_ok")
                    )
                );

            await tx
                .update(distributionCycle)
                .set({
                    status: "stopped",
                    finishedAt: now,
                })
                .where(eq(distributionCycle.id, cycle.id));

            await tx
                .update(lead)
                .set({
                    assignedTo: null,
                    flowStatus: "open",
                    updatedAt: now,
                })
                .where(eq(lead.id, cycle.leadId));

            await logDistributionActivity(
                tx as unknown as DbExecutor,
                cycle.leadId,
                "note",
                "Distribusi dihentikan manual oleh admin (emergency stop)."
            );
        });
    }

    return {
        stoppedCycles: activeCycles.length,
    };
}

export async function startDistributionForHeldLead(
    leadId: string,
    clientId?: string | null
) {
    const now = new Date();
    const [leadRow] = await db
        .select({
            id: lead.id,
            flowStatus: lead.flowStatus,
            assignedTo: lead.assignedTo,
            clientId: lead.clientId,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    if (!leadRow) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (clientId && leadRow.clientId !== clientId) {
        throw new Error("FORBIDDEN_LEAD_SCOPE");
    }

    if (leadRow.assignedTo) {
        throw new Error("LEAD_ALREADY_ASSIGNED");
    }

    const flowStatus = leadRow.flowStatus || "open";
    if (flowStatus !== "hold" && flowStatus !== "open") {
        throw new Error("LEAD_NOT_STARTABLE");
    }

    if (flowStatus === "hold") {
        await db
            .update(lead)
            .set({
                flowStatus: "open",
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        await logDistributionActivity(
            db,
            leadId,
            "note",
            "Lead hold dilepas oleh admin dan distribusi dimulai."
        );
    }

    const cycle = await ensureActiveCycle(leadId);
    return {
        leadId,
        status: "started",
        cycleId: cycle.id,
        cycleStatus: cycle.status,
    };
}
