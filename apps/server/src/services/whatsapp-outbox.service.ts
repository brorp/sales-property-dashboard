import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index";
import { waMessage, whatsappOutbox } from "../db/schema";
import { generateId } from "../utils/id";
import { createComponentLogger } from "../utils/logger";
import { normalizePhone } from "../utils/phone";
import {
    getWhatsAppOutboxRetryDelayMs,
    shouldReconcileWhatsAppOutbox,
} from "../utils/whatsapp-runtime";
import { recordWhatsAppAlert, resolveWhatsAppAlert } from "./whatsapp-alert.service";
import { getActiveWhatsAppNumber } from "./whatsapp-identity.service";
import { sendWhatsAppText } from "./whatsapp-provider.service";

const outboxLogger = createComponentLogger("wa:outbox");
const PROCESSING_STALE_MS = 5 * 60_000;

type DbExecutor = typeof db;

export type EnqueueWhatsAppOutboxInput = {
    clientId: string;
    dedupeKey: string;
    messageType: string;
    recipientWa: string;
    body: string;
    reconciliationMarker?: string | null;
    leadId?: string | null;
    salesId?: string | null;
    maxAttempts?: number;
};

function outboxAlertInput(row: typeof whatsappOutbox.$inferSelect, message: string) {
    return {
        eventCode: "outbox_delivery_pending",
        component: "wa:outbox",
        message,
        clientId: row.clientId,
        leadId: row.leadId,
        salesId: row.salesId,
        dedupeKey: row.id,
    };
}

export async function enqueueWhatsAppOutbox(
    input: EnqueueWhatsAppOutboxInput,
    executor: DbExecutor = db
) {
    const recipientWa = normalizePhone(input.recipientWa);
    if (!recipientWa || recipientWa.replace(/\D/g, "").length < 8) {
        throw new Error("WHATSAPP_OUTBOX_INVALID_RECIPIENT");
    }

    const now = new Date();
    const [inserted] = await executor
        .insert(whatsappOutbox)
        .values({
            id: generateId(),
            clientId: input.clientId,
            dedupeKey: input.dedupeKey,
            messageType: input.messageType,
            recipientWa,
            body: input.body,
            reconciliationMarker: input.reconciliationMarker || null,
            status: "pending",
            attemptCount: 0,
            maxAttempts: Math.max(1, input.maxAttempts || 288),
            availableAt: now,
            leadId: input.leadId || null,
            salesId: input.salesId || null,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoNothing({ target: whatsappOutbox.dedupeKey })
        .returning();

    if (inserted) {
        return inserted;
    }

    const [existing] = await executor
        .select()
        .from(whatsappOutbox)
        .where(eq(whatsappOutbox.dedupeKey, input.dedupeKey))
        .limit(1);

    if (!existing) {
        throw new Error("WHATSAPP_OUTBOX_ENQUEUE_FAILED");
    }
    return existing;
}

async function markOutboxSent(
    row: typeof whatsappOutbox.$inferSelect,
    providerMessageId?: string | null,
    reconciled = false
) {
    const now = new Date();
    await db.transaction(async (tx) => {
        await tx
            .update(whatsappOutbox)
            .set({
                status: "sent",
                sentAt: now,
                providerMessageId: providerMessageId || null,
                processingStartedAt: null,
                lastError: null,
                updatedAt: now,
            })
            .where(eq(whatsappOutbox.id, row.id));

        await tx
            .insert(waMessage)
            .values({
                id: `outbox:${row.id}`,
                providerMessageId: providerMessageId || null,
                fromWa: getActiveWhatsAppNumber(),
                toWa: row.recipientWa,
                body: row.body,
                direction: "outbound_to_sales",
                leadId: row.leadId,
                salesId: row.salesId,
                createdAt: now,
            })
            .onConflictDoNothing();
    });

    await resolveWhatsAppAlert({
        eventCode: "outbox_delivery_pending",
        dedupeKey: row.id,
        clientId: row.clientId,
    });
    outboxLogger.info("Durable WhatsApp reply delivered", {
        outboxId: row.id,
        clientId: row.clientId,
        messageType: row.messageType,
        leadId: row.leadId,
        salesId: row.salesId,
        reconciled,
        providerMessageId: providerMessageId || null,
    });
}

async function rescheduleOutbox(
    row: typeof whatsappOutbox.$inferSelect,
    errorMessage: string
) {
    const attemptCount = Number(row.attemptCount || 0);
    const exhausted = attemptCount >= Number(row.maxAttempts || 288);
    const now = new Date();
    const availableAt = new Date(now.getTime() + getWhatsAppOutboxRetryDelayMs(attemptCount));

    await db
        .update(whatsappOutbox)
        .set({
            status: exhausted ? "failed" : "pending",
            availableAt,
            processingStartedAt: null,
            lastError: errorMessage.slice(0, 2000),
            updatedAt: now,
        })
        .where(eq(whatsappOutbox.id, row.id));

    await recordWhatsAppAlert({
        ...outboxAlertInput(
            row,
            exhausted
                ? "Balasan WhatsApp gagal permanen setelah seluruh percobaan retry."
                : "Balasan WhatsApp tertunda dan akan dicoba ulang otomatis."
        ),
        eventCode: exhausted ? "outbox_delivery_failed" : "outbox_delivery_pending",
        severity: exhausted ? "critical" : "warning",
        metadata: {
            outboxId: row.id,
            messageType: row.messageType,
            attemptCount,
            maxAttempts: row.maxAttempts,
            nextAttemptAt: exhausted ? null : availableAt.toISOString(),
            error: errorMessage,
        },
    });
}

export async function processWhatsAppOutboxItem(
    outboxId: string,
    expectedClientId?: string | null
) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
    const [claimed] = await db
        .update(whatsappOutbox)
        .set({
            status: "processing",
            attemptCount: sql`${whatsappOutbox.attemptCount} + 1`,
            processingStartedAt: now,
            lastAttemptAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(whatsappOutbox.id, outboxId),
                expectedClientId ? eq(whatsappOutbox.clientId, expectedClientId) : undefined,
                or(
                    and(
                        eq(whatsappOutbox.status, "pending"),
                        lte(whatsappOutbox.availableAt, now)
                    ),
                    and(
                        eq(whatsappOutbox.status, "processing"),
                        lte(whatsappOutbox.processingStartedAt, staleBefore)
                    )
                )
            )
        )
        .returning();

    if (!claimed) {
        return { processed: false as const };
    }

    try {
        if (
            shouldReconcileWhatsAppOutbox(
                claimed.attemptCount,
                claimed.reconciliationMarker
            ) &&
            claimed.reconciliationMarker
        ) {
            const { inspectRecentOutboundWhatsAppText } = await import(
                "./whatsapp-qr.service"
            );
            const reconciliation = await inspectRecentOutboundWhatsAppText({
                to: claimed.recipientWa,
                marker: claimed.reconciliationMarker,
                sentAfter: claimed.createdAt,
            });
            if (reconciliation.status === "found") {
                await markOutboxSent(
                    claimed,
                    reconciliation.providerMessageId,
                    true
                );
                return { processed: true as const, sent: true as const, reconciled: true as const };
            }
            if (reconciliation.status === "unavailable") {
                await rescheduleOutbox(claimed, reconciliation.error);
                return { processed: true as const, sent: false as const };
            }
        }

        const delivery = await sendWhatsAppText(claimed.recipientWa, claimed.body, {
            jobId: `outbox-${claimed.id}-attempt-${claimed.attemptCount}`,
        });
        if (!delivery.sent) {
            await rescheduleOutbox(
                claimed,
                delivery.error || delivery.errorCode || "WhatsApp delivery failed"
            );
            return { processed: true as const, sent: false as const };
        }

        await markOutboxSent(claimed, delivery.providerMessageId || null);
        return { processed: true as const, sent: true as const, reconciled: false as const };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown error");
        await rescheduleOutbox(claimed, message);
        return { processed: true as const, sent: false as const };
    }
}

export async function processPendingWhatsAppOutbox(clientId: string, limit = 20) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
    const rows = await db
        .select({ id: whatsappOutbox.id })
        .from(whatsappOutbox)
        .where(
            and(
                eq(whatsappOutbox.clientId, clientId),
                inArray(whatsappOutbox.status, ["pending", "processing"]),
                or(
                    and(
                        eq(whatsappOutbox.status, "pending"),
                        lte(whatsappOutbox.availableAt, now)
                    ),
                    and(
                        eq(whatsappOutbox.status, "processing"),
                        lte(whatsappOutbox.processingStartedAt, staleBefore)
                    )
                )
            )
        )
        .limit(Math.max(1, Math.min(limit, 100)));

    let processed = 0;
    for (const row of rows) {
        const result = await processWhatsAppOutboxItem(row.id, clientId);
        if (result.processed) {
            processed += 1;
        }
    }
    return processed;
}
