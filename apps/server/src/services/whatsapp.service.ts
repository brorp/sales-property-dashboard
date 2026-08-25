import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { distributionAttempt, lead, user, waMessage } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { ensureActiveCycle, handleSalesAck } from "./distribution.service";
import { getOperationalWindowState } from "./system-settings.service";
import { getActiveWhatsAppNumber } from "./whatsapp-identity.service";
import { createComponentLogger } from "../utils/logger";
import { buildWhatsAppReplyMarker } from "../utils/whatsapp-runtime";
import {
    buildLeadCode,
    ensureLeadCode,
    renderLeadMessageTemplate,
} from "./lead-code.service";
import {
    enqueueWhatsAppOutbox,
    processWhatsAppOutboxItem,
} from "./whatsapp-outbox.service";
import { recordWhatsAppAlert } from "./whatsapp-alert.service";

const waIngestLogger = createComponentLogger("wa:ingest");

export interface IncomingWhatsAppPayload {
    fromWa: string;
    toWa?: string;
    body: string;
    providerMessageId?: string;
    sourceAds?: string;
    clientName?: string;
    metaLeadId?: string;
    clientId?: string | null;
}

async function isDuplicateMessage(providerMessageId?: string) {
    if (!providerMessageId) {
        return false;
    }

    const [existing] = await db
        .select({ id: waMessage.id })
        .from(waMessage)
        .where(eq(waMessage.providerMessageId, providerMessageId))
        .limit(1);

    return Boolean(existing);
}

async function hasInboundClientMessage(params: {
    fromWa: string;
    leadId?: string | null;
    clientId?: string | null;
}) {
    if (params.leadId) {
        const [existingByLead] = await db
            .select({ id: waMessage.id })
            .from(waMessage)
            .where(
                and(
                    eq(waMessage.leadId, params.leadId),
                    eq(waMessage.direction, "inbound_from_client")
                )
            )
            .limit(1);

        return Boolean(existingByLead);
    }

    const messageQuery = db
        .select({ id: waMessage.id })
        .from(waMessage)
        .innerJoin(lead, eq(waMessage.leadId, lead.id))
        .where(
            and(
                eq(waMessage.fromWa, params.fromWa),
                eq(waMessage.direction, "inbound_from_client"),
                params.clientId ? eq(lead.clientId, params.clientId) : undefined
            )
        )
        .limit(1);

    const [existingClientMessage] = await messageQuery;
    return Boolean(existingClientMessage);
}

async function sendSalesSystemReply(params: {
    clientId: string | null;
    inboundMessageId: string;
    replyType: "late" | "closed" | "recovery";
    salesId: string;
    salesPhone: string | null;
    leadId: string | null;
    body: string;
}) {
    try {
        if (!params.salesPhone) {
            throw new Error("SALES_PHONE_NOT_FOUND");
        }
        const [leadContext] = params.leadId
            ? await db
                .select({ clientId: lead.clientId })
                .from(lead)
                .where(eq(lead.id, params.leadId))
                .limit(1)
            : [];
        const clientId = params.clientId || leadContext?.clientId || null;
        if (!clientId) {
            throw new Error("WHATSAPP_REPLY_CLIENT_NOT_FOUND");
        }
        const leadCode = params.leadId ? await ensureLeadCode(params.leadId) : null;
        const reconciliationMarker = leadCode
            ? buildWhatsAppReplyMarker(leadCode, params.replyType)
            : null;
        const body = reconciliationMarker
            ? `${reconciliationMarker}\n${params.body}`
            : params.body;
        const outbox = await enqueueWhatsAppOutbox({
            clientId,
            dedupeKey: `sales-system-reply:${params.inboundMessageId}:${params.replyType}`,
            messageType: `sales_${params.replyType}_reply`,
            recipientWa: params.salesPhone,
            body,
            reconciliationMarker,
            leadId: params.leadId,
            salesId: params.salesId,
        });
        return processWhatsAppOutboxItem(outbox.id, clientId);
    } catch (error) {
        await recordWhatsAppAlert({
            eventCode: "sales_reply_enqueue_failed",
            component: "wa:ingest",
            message: "Balasan sistem untuk sales gagal dicatat ke antrean durable.",
            severity: "critical",
            clientId: params.clientId,
            leadId: params.leadId,
            salesId: params.salesId,
            dedupeKey: params.inboundMessageId,
            metadata: {
                replyType: params.replyType,
                error: error instanceof Error ? error.message : String(error),
            },
        });
        return { processed: false as const };
    }
}

export async function ingestIncomingMessage(payload: IncomingWhatsAppPayload) {
    if (await isDuplicateMessage(payload.providerMessageId)) {
        waIngestLogger.info("Inbound payload ignored", {
            reason: "duplicate_message_id",
            providerMessageId: payload.providerMessageId || null,
            fromWa: payload.fromWa || null,
        });
        return { type: "duplicate" as const };
    }

    const now = new Date();
    const fromWa = normalizePhone(String(payload.fromWa || ""));
    const toWa = payload.toWa ? normalizePhone(String(payload.toWa)) : getActiveWhatsAppNumber();
    const messageBody = String(payload.body || "").trim();

    if (!fromWa || fromWa.replace(/[^\d]/g, "").length < 8) {
        waIngestLogger.info("Inbound payload ignored", {
            reason: "invalid_sender_phone",
            providerMessageId: payload.providerMessageId || null,
            fromWa: payload.fromWa || null,
        });
        return { type: "ignored" as const, reason: "invalid_sender_phone" as const };
    }

    if (!messageBody) {
        waIngestLogger.info("Inbound payload ignored", {
            reason: "empty_body",
            providerMessageId: payload.providerMessageId || null,
            fromWa,
        });
        return { type: "ignored" as const, reason: "empty_body" as const };
    }

    const [salesSender] = await db
        .select({
            id: user.id,
            name: user.name,
            role: user.role,
            phone: user.phone,
        })
        .from(user)
        .where(
            and(
                eq(user.phone, fromWa),
                eq(user.role, "sales"),
                eq(user.isActive, true)
            )
        )
        .limit(1);

    if (salesSender) {
        const attemptSelection = {
            leadId: distributionAttempt.leadId,
            status: distributionAttempt.status,
            closeReason: distributionAttempt.closeReason,
            clientId: lead.clientId,
        };

        const [waitingAttempt] = await db
            .select(attemptSelection)
            .from(distributionAttempt)
            .innerJoin(lead, eq(distributionAttempt.leadId, lead.id))
            .where(
                and(
                    eq(distributionAttempt.salesId, salesSender.id),
                    eq(distributionAttempt.status, "waiting_ok"),
                    payload.clientId ? eq(lead.clientId, payload.clientId) : undefined
                )
            )
            .orderBy(desc(distributionAttempt.assignedAt))
            .limit(1);

        const [latestClosedAttempt] = waitingAttempt
            ? []
            : await db
                .select(attemptSelection)
                .from(distributionAttempt)
                .innerJoin(lead, eq(distributionAttempt.leadId, lead.id))
                .where(
                    and(
                        eq(distributionAttempt.salesId, salesSender.id),
                        payload.clientId ? eq(lead.clientId, payload.clientId) : undefined
                    )
                )
                .orderBy(desc(distributionAttempt.assignedAt))
                .limit(1);
        const latestAttempt = waitingAttempt || latestClosedAttempt;
        const targetLeadId = latestAttempt?.leadId || null;

        const [message] = await db
            .insert(waMessage)
            .values({
                id: generateId(),
                providerMessageId: payload.providerMessageId || null,
                fromWa,
                toWa,
                body: messageBody,
                direction: "inbound_from_sales",
                leadId: targetLeadId,
                salesId: salesSender.id,
                createdAt: now,
            })
            .returning();

        const isAckMessage = messageBody.toLowerCase() === "ok";
        if (!latestAttempt || latestAttempt.status !== "waiting_ok") {
            if (
                isAckMessage &&
                latestAttempt?.status === "timeout" &&
                latestAttempt.closeReason === "ack_timeout_5m"
            ) {
                await sendSalesSystemReply({
                    clientId: latestAttempt.clientId,
                    inboundMessageId: message.id,
                    replyType: "late",
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Balasan OK terlambat (melewati batas waktu claim), lead sudah dialihkan ke antrian sales berikutnya.",
                });
            } else if (isAckMessage && latestAttempt?.status === "accepted") {
                await sendSalesSystemReply({
                    clientId: latestAttempt.clientId,
                    inboundMessageId: message.id,
                    replyType: "closed",
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Lead ini sudah ter-claim, distribusi sudah dihentikan.",
                });
            } else if (
                isAckMessage &&
                latestAttempt?.status === "closed" &&
                latestAttempt.closeReason === "accepted_by_other"
            ) {
                await sendSalesSystemReply({
                    clientId: latestAttempt.clientId,
                    inboundMessageId: message.id,
                    replyType: "closed",
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Lead ini sudah di-claim oleh agent lain, distribusi sudah ditutup.",
                });
            } else if (
                isAckMessage &&
                latestAttempt?.status === "closed" &&
                latestAttempt.closeReason === "send_uncertain_transient"
            ) {
                await sendSalesSystemReply({
                    clientId: latestAttempt.clientId,
                    inboundMessageId: message.id,
                    replyType: "recovery",
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Koneksi WhatsApp sempat tidak stabil. Offer ini sedang dipulihkan dan tidak dialihkan ke sales lain.",
                });
            }

            return {
                type: "sales_message_no_pending_lead" as const,
                message,
                reason: latestAttempt?.status || "no_attempt",
            };
        }

        const ackResult = await handleSalesAck(
            latestAttempt.leadId,
            salesSender.id,
            messageBody,
            payload.clientId || null
        );

        if (ackResult.accepted) {
            if (ackResult.claimReplyOutboxId) {
                await processWhatsAppOutboxItem(
                    ackResult.claimReplyOutboxId,
                    latestAttempt.clientId
                );
            }
        } else if (ackResult.reason === "late_timeout") {
            await sendSalesSystemReply({
                clientId: latestAttempt.clientId,
                inboundMessageId: message.id,
                replyType: "late",
                salesId: salesSender.id,
                salesPhone: salesSender.phone,
                leadId: targetLeadId,
                body: "Balasan OK terlambat (melewati batas waktu claim), lead sudah dialihkan ke antrian sales berikutnya.",
            });
        }

        return {
            type: "sales_message" as const,
            message,
            ackResult,
            leadId: targetLeadId,
        };
    }

    let [clientLead] = await db
        .select()
        .from(lead)
        .where(
            and(
                eq(lead.phone, fromWa),
                payload.clientId ? eq(lead.clientId, payload.clientId) : undefined
            )
        )
        .orderBy(desc(lead.createdAt))
        .limit(1);

    if (
        clientLead &&
        payload.clientName &&
        (clientLead.name === "Unknown Client" || clientLead.name.trim().length === 0)
    ) {
        const [updatedLead] = await db
            .update(lead)
            .set({
                name: payload.clientName,
                updatedAt: now,
            })
            .where(eq(lead.id, clientLead.id))
            .returning();
        clientLead = updatedLead;
    }

    const hadInboundBefore = clientLead
        ? await hasInboundClientMessage({
            leadId: clientLead.id,
            clientId: payload.clientId || clientLead.clientId || null,
            fromWa,
        })
        : false;

    const operationalWindow = await getOperationalWindowState(
        now,
        payload.clientId || clientLead?.clientId || null
    );
    const shouldHoldByOperationalHours = !operationalWindow.isOpen;

    if (!clientLead) {
        const leadId = generateId();
        const [createdLead] = await db
            .insert(lead)
            .values({
                id: leadId,
                leadCode: buildLeadCode(`${payload.clientId || "global"}:${leadId}`),
                name: payload.clientName || "Unknown Client",
                phone: fromWa,
                source: "Online",
                metaLeadId: payload.metaLeadId || null,
                clientId: payload.clientId || null,
                entryChannel: "whatsapp_inbound",
                receivedAt: now,
                assignedTo: null,
                flowStatus: shouldHoldByOperationalHours ? "hold" : "open",
                salesStatus: null,
                domicileCity: null,
                resultStatus: null,
                unitName: null,
                unitDetail: null,
                paymentMethod: null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        clientLead = createdLead;
    } else {
        if (!clientLead.leadCode) {
            const leadCode = await ensureLeadCode(clientLead.id);
            clientLead = {
                ...clientLead,
                leadCode,
            };
        }

        if (
            shouldHoldByOperationalHours &&
            !clientLead.assignedTo &&
            clientLead.flowStatus !== "hold"
        ) {
            const [updatedLead] = await db
                .update(lead)
                .set({
                    flowStatus: "hold",
                    updatedAt: now,
                })
                .where(eq(lead.id, clientLead.id))
                .returning();
            clientLead = updatedLead || clientLead;
        }
    }

    const [message] = await db
        .insert(waMessage)
        .values({
            id: generateId(),
            providerMessageId: payload.providerMessageId || null,
            fromWa,
            toWa,
            body: messageBody,
            direction: "inbound_from_client",
            leadId: clientLead.id,
            salesId: null,
            createdAt: now,
        })
        .returning();

    if (
        clientLead.assignedTo ||
        clientLead.flowStatus === "assigned" ||
        clientLead.flowStatus === "accepted"
    ) {
        return {
            type: "client_message" as const,
            message,
            lead: clientLead,
            cycle: null,
            firstClientMessage: false,
            heldByOperationalHours: false,
            autoReplyText: null,
        };
    }

    if (clientLead.flowStatus === "hold") {
        const fallbackOutsideReply = `Terima kasih sudah menghubungi kami. Jam operasional kami ${operationalWindow.operationalRangeLabel}. Tim kami akan merespons saat jam operasional.`;
        return {
            type: "client_message" as const,
            message,
            lead: clientLead,
            cycle: null,
            firstClientMessage: !hadInboundBefore,
            heldByOperationalHours: true,
            autoReplyText: renderLeadMessageTemplate(
                operationalWindow.outsideOfficeReply || fallbackOutsideReply,
                {
                    leadCode: clientLead.leadCode,
                    leadName: clientLead.name,
                }
            ),
        };
    }

    const cycle = await ensureActiveCycle(clientLead.id);

    return {
        type: "client_message" as const,
        message,
        lead: clientLead,
        cycle,
        firstClientMessage: !hadInboundBefore,
        heldByOperationalHours: false,
        autoReplyText: renderLeadMessageTemplate(
            operationalWindow.insideOfficeReply ||
                "Harap menunggu agent professional akan menghubungi anda",
            {
                leadCode: clientLead.leadCode,
                leadName: clientLead.name,
            }
        ),
    };
}
