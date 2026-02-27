import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { distributionAttempt, lead, user, waMessage } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { ensureActiveCycle, handleSalesAck } from "./distribution.service";
import { getOperationalWindowState } from "./system-settings.service";
import { sendWhatsAppText } from "./whatsapp-provider.service";

const PROPERTY_LOUNGE_WA = process.env.PROPERTY_LOUNGE_WA || "+620000000000";

export interface IncomingWhatsAppPayload {
    fromWa: string;
    toWa?: string;
    body: string;
    providerMessageId?: string;
    sourceAds?: string;
    clientName?: string;
    metaLeadId?: string;
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

async function hasInboundClientMessageFromPhone(fromWa: string) {
    const [existingClientMessage] = await db
        .select({ id: waMessage.id })
        .from(waMessage)
        .where(
            and(
                eq(waMessage.fromWa, fromWa),
                eq(waMessage.direction, "inbound_from_client")
            )
        )
        .limit(1);

    return Boolean(existingClientMessage);
}

async function sendSalesSystemReply(params: {
    salesId: string;
    salesPhone: string | null;
    leadId: string | null;
    body: string;
}) {
    const now = new Date();
    const fallbackProvider = (process.env.WA_PROVIDER || "dummy") as
        | "dummy"
        | "cloud_api"
        | "qr_local";
    const outboundResult = params.salesPhone
        ? await sendWhatsAppText(params.salesPhone, params.body)
        : {
              sent: false,
              provider: fallbackProvider,
              error: "Sales phone is empty",
          };

    await db.insert(waMessage).values({
        id: generateId(),
        providerMessageId: outboundResult.providerMessageId || null,
        fromWa: PROPERTY_LOUNGE_WA,
        toWa: params.salesPhone || `sales:${params.salesId}`,
        body: outboundResult.sent
            ? params.body
            : `${params.body}\n\n[send_error] ${outboundResult.error || "unknown"}`,
        direction: "outbound_to_sales",
        leadId: params.leadId,
        salesId: params.salesId,
        createdAt: now,
    });
}

export async function ingestIncomingMessage(payload: IncomingWhatsAppPayload) {
    if (await isDuplicateMessage(payload.providerMessageId)) {
        return { type: "duplicate" as const };
    }

    const now = new Date();
    const fromWa = normalizePhone(payload.fromWa);
    const toWa = payload.toWa ? normalizePhone(payload.toWa) : PROPERTY_LOUNGE_WA;
    const messageBody = payload.body.trim();

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
        const [latestAttempt] = await db
            .select({
                leadId: distributionAttempt.leadId,
                status: distributionAttempt.status,
                closeReason: distributionAttempt.closeReason,
            })
            .from(distributionAttempt)
            .where(eq(distributionAttempt.salesId, salesSender.id))
            .orderBy(desc(distributionAttempt.assignedAt))
            .limit(1);

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
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Balasan OK terlambat (melewati batas waktu claim), lead sudah dialihkan ke antrian sales berikutnya.",
                });
            } else if (isAckMessage && latestAttempt?.status === "accepted") {
                await sendSalesSystemReply({
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
                    salesId: salesSender.id,
                    salesPhone: salesSender.phone,
                    leadId: targetLeadId,
                    body: "Lead ini sudah di-claim oleh agent lain, distribusi sudah ditutup.",
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
            messageBody
        );

        if (ackResult.accepted) {
            await sendSalesSystemReply({
                salesId: salesSender.id,
                salesPhone: salesSender.phone,
                leadId: targetLeadId,
                body:
                    ackResult.claimLeadMessage ||
                    "OK diterima. Lead berhasil di-assign ke dashboard Anda.",
            });
        } else if (ackResult.reason === "late_timeout") {
            await sendSalesSystemReply({
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
        .where(eq(lead.phone, fromWa))
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

    const duplicateClientInbound = await hasInboundClientMessageFromPhone(fromWa);
    if (duplicateClientInbound) {
        return {
            type: "duplicate_client_lead" as const,
            ignored: true,
            leadId: clientLead?.id || null,
        };
    }

    const operationalWindow = await getOperationalWindowState();
    const shouldHoldByOperationalHours = !operationalWindow.isOpen;

    if (!clientLead) {
        const [createdLead] = await db
            .insert(lead)
            .values({
                id: generateId(),
                name: payload.clientName || "Unknown Client",
                phone: fromWa,
                source: payload.sourceAds || "WhatsApp Inbound",
                metaLeadId: payload.metaLeadId || null,
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

    if (clientLead.flowStatus === "hold") {
        return {
            type: "client_message" as const,
            message,
            lead: clientLead,
            cycle: null,
            firstClientMessage: true,
            heldByOperationalHours: true,
            autoReplyText:
                operationalWindow.outsideOfficeReply ||
                `Terima kasih sudah menghubungi kami. Jam operasional kami ${operationalWindow.operationalRangeLabel}. Tim kami akan merespons saat jam operasional.`,
        };
    }

    const cycle = await ensureActiveCycle(clientLead.id);

    return {
        type: "client_message" as const,
        message,
        lead: clientLead,
        cycle,
        firstClientMessage: true,
        heldByOperationalHours: false,
        autoReplyText: "Harap menunggu agent professional akan menghubungi anda",
    };
}
