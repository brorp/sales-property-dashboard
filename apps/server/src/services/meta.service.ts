import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index";
import { activity, lead, user } from "../db/schema";
import { sendToUsers } from "./push-notification.service";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { getOperationalWindowState } from "./system-settings.service";
import { buildLeadCode, ensureLeadCode } from "./lead-code.service";

export interface MetaLeadPayload {
    metaLeadId?: string;
    name: string;
    phone: string;
    sourceAds?: string;
    clientId?: string | null;
}

export async function ingestMetaLead(payload: MetaLeadPayload) {
    const normalizedPhone = normalizePhone(payload.phone);
    const now = new Date();
    const operationalWindow = await getOperationalWindowState(now, payload.clientId || null);
    const flowStatus = operationalWindow.isOpen ? "open" : "hold";

    if (payload.metaLeadId) {
        const metaConditions = [eq(lead.metaLeadId, payload.metaLeadId)];
        if (payload.clientId) {
            metaConditions.push(eq(lead.clientId, payload.clientId));
        }

        const [existingByMetaId] = await db
            .select()
            .from(lead)
            .where(and(...metaConditions))
            .limit(1);

        if (existingByMetaId) {
            return { lead: existingByMetaId, created: false };
        }
    }

    const phoneConditions = [
        eq(lead.phone, normalizedPhone),
        or(eq(lead.flowStatus, "open"), eq(lead.flowStatus, "hold")),
    ];
    if (payload.clientId) {
        phoneConditions.push(eq(lead.clientId, payload.clientId));
    }

    const [existingByPhone] = await db
        .select()
        .from(lead)
        .where(and(...phoneConditions))
        .orderBy(asc(lead.createdAt))
        .limit(1);

    if (existingByPhone) {
        if (!existingByPhone.leadCode) {
            await ensureLeadCode(existingByPhone.id);
        }

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

    const leadId = generateId();
    const [newLead] = await db
        .insert(lead)
        .values({
            id: leadId,
            leadCode: buildLeadCode(`${payload.clientId || "global"}:${leadId}`),
            name: payload.name,
            phone: normalizedPhone,
            source: payload.sourceAds || "Meta Ads CTA",
            metaLeadId: payload.metaLeadId || null,
            clientId: payload.clientId || null,
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

    // Notif admin saat lead masuk hold (di luar jam operasional)
    if (flowStatus === "hold" && payload.clientId) {
        const admins = await db
            .select({ id: user.id })
            .from(user)
            .where(
                and(
                    inArray(user.role, ["client_admin", "root_admin"]),
                    eq(user.clientId, payload.clientId),
                    eq(user.isActive, true)
                )
            );
        if (admins.length) {
            void sendToUsers(admins.map((a) => a.id), {
                title: "Lead Baru Masuk (Hold)",
                body: `${newLead.name} masuk di luar jam operasional dan perlu distribusi manual.`,
                data: { leadId: newLead.id, type: "hold_lead" },
            });
        }
    }

    return { lead: newLead, created: true };
}
