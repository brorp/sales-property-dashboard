import { and, asc, eq, or } from "drizzle-orm";
import { db } from "../db";
import { activity, lead } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { getOperationalWindowState } from "./system-settings.service";

export interface MetaLeadPayload {
    metaLeadId?: string;
    name: string;
    phone: string;
    sourceAds?: string;
}

export async function ingestMetaLead(payload: MetaLeadPayload) {
    const normalizedPhone = normalizePhone(payload.phone);
    const now = new Date();
    const operationalWindow = await getOperationalWindowState(now);
    const flowStatus = operationalWindow.isOpen ? "open" : "hold";

    if (payload.metaLeadId) {
        const [existingByMetaId] = await db
            .select()
            .from(lead)
            .where(eq(lead.metaLeadId, payload.metaLeadId))
            .limit(1);

        if (existingByMetaId) {
            return { lead: existingByMetaId, created: false };
        }
    }

    const [existingByPhone] = await db
        .select()
        .from(lead)
        .where(
            and(
                eq(lead.phone, normalizedPhone),
                or(eq(lead.flowStatus, "open"), eq(lead.flowStatus, "hold"))
            )
        )
        .orderBy(asc(lead.createdAt))
        .limit(1);

    if (existingByPhone) {
        const [updated] = await db
            .update(lead)
            .set({
                name:
                    existingByPhone.name === "Unknown Client"
                        ? payload.name
                        : existingByPhone.name,
                metaLeadId: payload.metaLeadId || existingByPhone.metaLeadId,
                source: payload.sourceAds || existingByPhone.source,
                updatedAt: now,
            })
            .where(eq(lead.id, existingByPhone.id))
            .returning();

        return { lead: updated, created: false };
    }

    const [newLead] = await db
        .insert(lead)
        .values({
            id: generateId(),
            name: payload.name,
            phone: normalizedPhone,
            source: payload.sourceAds || "Meta Ads CTA",
            metaLeadId: payload.metaLeadId || null,
            entryChannel: "meta_ads",
            receivedAt: now,
            assignedTo: null,
            flowStatus,
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

    await db.insert(activity).values({
        id: generateId(),
        leadId: newLead.id,
        type: "new",
        note: `Lead masuk dari Meta Ads${payload.metaLeadId ? ` (${payload.metaLeadId})` : ""}.`,
        timestamp: now,
    });

    return { lead: newLead, created: true };
}
