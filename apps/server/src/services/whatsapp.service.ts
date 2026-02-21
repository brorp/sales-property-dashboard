import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { distributionAttempt, lead, user, waMessage } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { ensureActiveCycle, handleSalesAck } from "./distribution.service";

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
        const [latestWaitingAttempt] = await db
            .select({
                leadId: distributionAttempt.leadId,
            })
            .from(distributionAttempt)
            .where(
                and(
                    eq(distributionAttempt.salesId, salesSender.id),
                    eq(distributionAttempt.status, "waiting_ok")
                )
            )
            .orderBy(desc(distributionAttempt.assignedAt))
            .limit(1);

        const targetLeadId = latestWaitingAttempt?.leadId || null;

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

        if (!targetLeadId) {
            return { type: "sales_message_no_pending_lead" as const, message };
        }

        const ackResult = await handleSalesAck(
            targetLeadId,
            salesSender.id,
            messageBody
        );

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
                clientStatus: "warm",
                progress: "new",
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        clientLead = createdLead;
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

    const cycle = await ensureActiveCycle(clientLead.id);

    return {
        type: "client_message" as const,
        message,
        lead: clientLead,
        cycle,
    };
}
