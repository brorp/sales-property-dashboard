import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../db";
import {
    activity,
    appointment,
    lead,
    user,
} from "../db/schema";
import { generateId } from "../utils/id";
import {
    resolveAppointmentTag,
    toAppointmentDateTime,
    type AppointmentTag,
} from "../utils/appointment";
import { createGoogleCalendarEvent } from "./calendar.service";

interface LeadFilters {
    search?: string;
    flowStatus?: string;
    salesStatus?: string;
    resultStatus?: string;
    assignedTo?: string;
    appointmentTag?: string;
    domicileCity?: string;
}

export type LeadPatchInput = {
    id: string;
    actorId: string;
    actorRole: string;
    name?: string;
    domicileCity?: string | null;
    salesStatus?: string | null;
    resultStatus?: string | null;
    unitName?: string | null;
    unitDetail?: string | null;
    paymentMethod?: string | null;
    rejectedReason?: string | null;
    rejectedNote?: string | null;
    assignedTo?: string | null;
    activityNote?: string;
};

const SALES_STATUS_SET = new Set(["hot", "warm", "cold", "error", "no_response", "skip"]);
const RESULT_STATUS_SET = new Set(["closing", "menunggu", "batal"]);

function sanitizeNullableText(value: unknown) {
    if (value === null) {
        return null;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeFlowStatus(
    flowStatus: string | null | undefined,
    assignedTo: string | null | undefined
) {
    if (flowStatus === "hold") {
        return "hold";
    }
    if (flowStatus === "assigned") {
        return "assigned";
    }
    if (assignedTo) {
        return "assigned";
    }
    return "open";
}

function sanitizeRequiredText(value: unknown) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function mapAppointmentTagFilter(value: string | undefined) {
    if (!value || value === "all") {
        return undefined;
    }
    if (value !== "mau_survey" && value !== "sudah_survey" && value !== "none") {
        return undefined;
    }
    return value;
}

function pickLatestAppointment<T extends { date: string; time: string }>(items: T[]) {
    if (items.length === 0) {
        return null;
    }

    let latest = items[0];
    let latestTime = toAppointmentDateTime(items[0].date, items[0].time).getTime();

    for (let i = 1; i < items.length; i += 1) {
        const next = items[i];
        const nextTime = toAppointmentDateTime(next.date, next.time).getTime();
        if (nextTime > latestTime) {
            latest = next;
            latestTime = nextTime;
        }
    }

    return latest;
}

async function enrichWithAppointmentTag<TRow extends { id: string }>(rows: TRow[]) {
    if (rows.length === 0) {
        return [] as Array<TRow & { appointmentTag: AppointmentTag }>;
    }

    const leadIds = rows.map((row) => row.id);

    const appointmentRows = await db
        .select({
            id: appointment.id,
            leadId: appointment.leadId,
            date: appointment.date,
            time: appointment.time,
            location: appointment.location,
            notes: appointment.notes,
            createdAt: appointment.createdAt,
            salesId: appointment.salesId,
        })
        .from(appointment)
        .where(inArray(appointment.leadId, leadIds));

    const appointmentByLead = new Map<string, typeof appointmentRows>();
    for (const item of appointmentRows) {
        const list = appointmentByLead.get(item.leadId) || [];
        list.push(item);
        appointmentByLead.set(item.leadId, list);
    }

    return rows.map((row) => {
        const list = appointmentByLead.get(row.id) || [];
        const latest = pickLatestAppointment(list);
        const appointmentTag = resolveAppointmentTag(latest || null);
        return {
            ...row,
            appointmentTag,
            latestAppointment: latest || null,
        };
    });
}

export async function findAll(
    filters: LeadFilters,
    userId: string,
    role: string
) {
    const conditions: Array<any> = [];

    if (role !== "admin") {
        conditions.push(eq(lead.assignedTo, userId));
    }

    if (filters.flowStatus && filters.flowStatus !== "all") {
        conditions.push(eq(lead.flowStatus, filters.flowStatus));
    }

    if (filters.salesStatus && filters.salesStatus !== "all") {
        conditions.push(eq(lead.salesStatus, filters.salesStatus));
    }

    if (filters.resultStatus && filters.resultStatus !== "all") {
        conditions.push(eq(lead.resultStatus, filters.resultStatus));
    }

    if (filters.assignedTo && filters.assignedTo !== "all") {
        conditions.push(eq(lead.assignedTo, filters.assignedTo));
    }

    if (filters.domicileCity && filters.domicileCity !== "all") {
        conditions.push(eq(lead.domicileCity, filters.domicileCity));
    }

    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        conditions.push(
            or(ilike(lead.name, searchPattern), ilike(lead.phone, searchPattern))
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            domicileCity: lead.domicileCity,
            resultStatus: lead.resultStatus,
            unitName: lead.unitName,
            unitDetail: lead.unitDetail,
            paymentMethod: lead.paymentMethod,
            rejectedReason: lead.rejectedReason,
            rejectedNote: lead.rejectedNote,
            metaLeadId: lead.metaLeadId,
            entryChannel: lead.entryChannel,
            receivedAt: lead.receivedAt,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            assignedUserName: user.name,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(whereClause)
        .orderBy(desc(lead.createdAt));

    const rowsWithTag = (await enrichWithAppointmentTag(rows)).map((row) => ({
        ...row,
        flowStatus: normalizeFlowStatus(row.flowStatus, row.assignedTo),
    }));
    const requestedTag = mapAppointmentTagFilter(filters.appointmentTag);
    if (!requestedTag) {
        return rowsWithTag;
    }

    return rowsWithTag.filter((row) => row.appointmentTag === requestedTag);
}

export async function findById(id: string) {
    const [leadData] = await db.select().from(lead).where(eq(lead.id, id)).limit(1);
    if (!leadData) {
        return null;
    }

    const assignedUserPromise = leadData.assignedTo
        ? db
              .select({
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  phone: user.phone,
              })
              .from(user)
              .where(eq(user.id, leadData.assignedTo))
              .limit(1)
        : Promise.resolve([]);

    const [activities, appointments, assignedUser] = await Promise.all([
        db
            .select()
            .from(activity)
            .where(eq(activity.leadId, id))
            .orderBy(desc(activity.timestamp)),
        db
            .select()
            .from(appointment)
            .where(eq(appointment.leadId, id))
            .orderBy(desc(appointment.createdAt)),
        assignedUserPromise,
    ]);

    const latestAppointment = pickLatestAppointment(appointments);

    return {
        ...leadData,
        flowStatus: normalizeFlowStatus(leadData.flowStatus, leadData.assignedTo),
        appointmentTag: resolveAppointmentTag(latestAppointment || null),
        latestAppointment: latestAppointment || null,
        activities,
        appointments,
        assignedUser: assignedUser[0] || null,
    };
}

export async function create(data: {
    name: string;
    phone: string;
    source: string;
    assignedTo?: string | null;
}) {
    const id = generateId();
    const now = new Date();
    const assignedTo = data.assignedTo || null;

    const [newLead] = await db
        .insert(lead)
        .values({
            id,
            name: data.name,
            phone: data.phone,
            source: data.source || "Manual Input",
            assignedTo,
            flowStatus: assignedTo ? "assigned" : "open",
            salesStatus: null,
            domicileCity: null,
            resultStatus: null,
            unitName: null,
            unitDetail: null,
            paymentMethod: null,
            receivedAt: now,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    await db.insert(activity).values({
        id: generateId(),
        leadId: id,
        type: "new",
        note: assignedTo
            ? "Lead baru ditambahkan dan langsung di-assign."
            : "Lead baru ditambahkan (status open).",
        timestamp: now,
    });

    return newLead;
}

export async function assignLead(data: {
    leadId: string;
    salesId: string;
    changedBy?: string;
    note?: string;
}) {
    const [currentLead] = await db
        .select({
            id: lead.id,
            assignedTo: lead.assignedTo,
        })
        .from(lead)
        .where(eq(lead.id, data.leadId))
        .limit(1);

    if (!currentLead) {
        return null;
    }

    if (currentLead.assignedTo) {
        throw new Error("ADMIN_ASSIGNED_LEAD_READ_ONLY");
    }

    const now = new Date();
    const [updated] = await db
        .update(lead)
        .set({
            assignedTo: data.salesId,
            flowStatus: "assigned",
            updatedAt: now,
        })
        .where(eq(lead.id, data.leadId))
        .returning();

    await db.insert(activity).values({
        id: generateId(),
        leadId: data.leadId,
        type: "note",
        note: `Lead di-assign ke sales ${data.salesId}${data.note ? ` (${data.note})` : ""}.`,
        timestamp: now,
    });

    return updated;
}

export async function addActivity(leadId: string, data: { note: string }) {
    const [newActivity] = await db
        .insert(activity)
        .values({
            id: generateId(),
            leadId,
            type: "note",
            note: data.note,
            timestamp: new Date(),
        })
        .returning();

    await db
        .update(lead)
        .set({ updatedAt: new Date() })
        .where(eq(lead.id, leadId));

    return newActivity;
}

export async function addAppointment(
    leadId: string,
    data: {
        date: string;
        time: string;
        location: string;
        notes?: string;
        salesId?: string;
    }
) {
    const now = new Date();
    const [year, month, day] = data.date.split("-").map((v) => Number(v));
    const [hours, minutes] = data.time.split(":").map((v) => Number(v));
    const startAt = new Date(
        year,
        (month || 1) - 1,
        day || 1,
        hours || 0,
        minutes || 0,
        0
    );
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const [leadRow] = await db
        .select({ name: lead.name, phone: lead.phone })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    const calendar = leadRow
        ? await createGoogleCalendarEvent({
              leadName: leadRow.name,
              leadPhone: leadRow.phone,
              startAt,
              endAt,
              location: data.location,
          })
        : { eventId: null };

    const [newAppointment] = await db
        .insert(appointment)
        .values({
            id: generateId(),
            leadId,
            salesId: data.salesId || null,
            date: data.date,
            time: data.time,
            location: data.location,
            notes: data.notes || null,
            googleEventId: calendar.eventId,
            createdAt: now,
        })
        .returning();

    await db.insert(activity).values({
        id: generateId(),
        leadId,
        type: "appointment",
        note: `Appointment dibuat untuk ${data.date} ${data.time} di ${data.location}`,
        timestamp: now,
    });

    await db
        .update(lead)
        .set({ updatedAt: now })
        .where(eq(lead.id, leadId));

    return newAppointment;
}

export async function getLeadAppointmentTag(leadId: string) {
    const rows = await db
        .select({
            date: appointment.date,
            time: appointment.time,
        })
        .from(appointment)
        .where(eq(appointment.leadId, leadId));

    const latest = pickLatestAppointment(rows);
    return resolveAppointmentTag(latest || null);
}

export async function patchLead(input: LeadPatchInput) {
    const [currentLead] = await db
        .select()
        .from(lead)
        .where(eq(lead.id, input.id))
        .limit(1);

    if (!currentLead) {
        return null;
    }

    if (input.actorRole === "admin" && currentLead.assignedTo) {
        throw new Error("ADMIN_ASSIGNED_LEAD_READ_ONLY");
    }

    if (input.actorRole !== "admin" && currentLead.assignedTo !== input.actorId) {
        throw new Error("FORBIDDEN_LEAD_EDIT");
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
        updatedAt: now,
    };
    const notes: string[] = [];

    const nextName = sanitizeRequiredText(input.name);
    if (typeof nextName === "string" && nextName !== currentLead.name) {
        updates.name = nextName;
        notes.push(`Nama lead diubah ke ${nextName}`);
    }

    if (input.domicileCity !== undefined) {
        const nextCity = sanitizeNullableText(input.domicileCity);
        if (nextCity !== undefined && nextCity !== currentLead.domicileCity) {
            updates.domicileCity = nextCity;
            notes.push(`Domisili diubah ke ${nextCity || "-"}`);
        }
    }

    if (input.assignedTo !== undefined) {
        if (input.actorRole !== "admin") {
            throw new Error("FORBIDDEN_ASSIGN");
        }
        const nextAssignedTo = sanitizeNullableText(input.assignedTo);
        if (nextAssignedTo !== undefined && nextAssignedTo !== currentLead.assignedTo) {
            updates.assignedTo = nextAssignedTo;
            updates.flowStatus = nextAssignedTo ? "assigned" : "open";
            notes.push(nextAssignedTo ? "Lead di-assign manual oleh admin" : "Assignment lead dilepas oleh admin");
        }
    }

    const currentNormalizedFlowStatus = normalizeFlowStatus(
        currentLead.flowStatus,
        currentLead.assignedTo
    );
    const nextFlowStatus =
        (typeof updates.flowStatus === "string"
            ? updates.flowStatus
            : currentNormalizedFlowStatus) || "open";

    if (input.salesStatus !== undefined) {
        const nextSalesStatus = sanitizeNullableText(input.salesStatus);
        if (nextSalesStatus && !SALES_STATUS_SET.has(nextSalesStatus)) {
            throw new Error("INVALID_SALES_STATUS");
        }
        if (nextSalesStatus && nextFlowStatus !== "assigned") {
            throw new Error("SALES_STATUS_REQUIRES_ASSIGNED");
        }
        if (nextSalesStatus !== undefined && nextSalesStatus !== currentLead.salesStatus) {
            updates.salesStatus = nextSalesStatus;
            notes.push(`Sales status diubah ke ${nextSalesStatus || "-"}`);
        }
    }

    const nextResultStatusRaw =
        input.resultStatus !== undefined
            ? sanitizeNullableText(input.resultStatus)
            : currentLead.resultStatus;
    const isResultStatusUpdated = input.resultStatus !== undefined;
    const isClosingFieldUpdated =
        input.unitName !== undefined ||
        input.unitDetail !== undefined ||
        input.paymentMethod !== undefined;
    const isRejectedFieldUpdated =
        input.rejectedReason !== undefined || input.rejectedNote !== undefined;

    if (isResultStatusUpdated) {
        if (nextResultStatusRaw && !RESULT_STATUS_SET.has(nextResultStatusRaw)) {
            throw new Error("INVALID_RESULT_STATUS");
        }

        if (nextResultStatusRaw) {
            const appointmentTag = await getLeadAppointmentTag(input.id);
            if (appointmentTag !== "sudah_survey") {
                throw new Error("RESULT_STATUS_REQUIRES_SUDAH_SURVEY");
            }
        }

        updates.resultStatus = nextResultStatusRaw;
        notes.push(`Result status diubah ke ${nextResultStatusRaw || "-"}`);
    }

    const nextResultStatus =
        (typeof updates.resultStatus === "string"
            ? updates.resultStatus
            : currentLead.resultStatus) || null;

    if (isClosingFieldUpdated) {
        if (nextResultStatus !== "closing") {
            throw new Error("CLOSING_FIELDS_REQUIRE_CLOSING_STATUS");
        }

        const nextUnitName =
            input.unitName !== undefined
                ? sanitizeNullableText(input.unitName)
                : currentLead.unitName;
        const nextUnitDetail =
            input.unitDetail !== undefined
                ? sanitizeNullableText(input.unitDetail)
                : currentLead.unitDetail;
        const nextPaymentMethod =
            input.paymentMethod !== undefined
                ? sanitizeNullableText(input.paymentMethod)
                : currentLead.paymentMethod;

        if (!nextUnitName || !nextUnitDetail || !nextPaymentMethod) {
            throw new Error("CLOSING_FIELDS_REQUIRED");
        }

        updates.unitName = nextUnitName;
        updates.unitDetail = nextUnitDetail;
        updates.paymentMethod = nextPaymentMethod;
        updates.rejectedReason = null;
        updates.rejectedNote = null;
    }

    if (isRejectedFieldUpdated) {
        if (nextResultStatus !== "batal") {
            throw new Error("REJECT_REASON_REQUIRES_BATAL_STATUS");
        }

        const nextReason =
            input.rejectedReason !== undefined
                ? sanitizeNullableText(input.rejectedReason)
                : currentLead.rejectedReason;
        const nextRejectedNote =
            input.rejectedNote !== undefined
                ? sanitizeNullableText(input.rejectedNote)
                : currentLead.rejectedNote;

        if (!nextReason) {
            throw new Error("REJECT_REASON_REQUIRED");
        }

        updates.rejectedReason = nextReason;
        updates.rejectedNote = nextRejectedNote || null;
        updates.unitName = null;
        updates.unitDetail = null;
        updates.paymentMethod = null;
    }

    if (
        nextResultStatus === "closing" &&
        (isResultStatusUpdated || isClosingFieldUpdated)
    ) {
        const unitName =
            typeof updates.unitName === "string" ? updates.unitName : currentLead.unitName;
        const unitDetail =
            typeof updates.unitDetail === "string" ? updates.unitDetail : currentLead.unitDetail;
        const paymentMethod =
            typeof updates.paymentMethod === "string"
                ? updates.paymentMethod
                : currentLead.paymentMethod;

        if (!unitName || !unitDetail || !paymentMethod) {
            throw new Error("CLOSING_FIELDS_REQUIRED");
        }

        updates.rejectedReason = null;
        updates.rejectedNote = null;
    }

    if (
        nextResultStatus === "batal" &&
        (isResultStatusUpdated || isRejectedFieldUpdated)
    ) {
        const reason =
            typeof updates.rejectedReason === "string"
                ? updates.rejectedReason
                : currentLead.rejectedReason;
        if (!reason) {
            throw new Error("REJECT_REASON_REQUIRED");
        }

        updates.unitName = null;
        updates.unitDetail = null;
        updates.paymentMethod = null;
    }

    if (isResultStatusUpdated) {
        if (nextResultStatus === "menunggu" || nextResultStatus === null) {
            updates.unitName = null;
            updates.unitDetail = null;
            updates.paymentMethod = null;
            if (nextResultStatus === "menunggu") {
                updates.rejectedReason = null;
                updates.rejectedNote = null;
            }
        }
    }

    const willUpdate = Object.keys(updates).length > 1;
    const [updatedLead] = willUpdate
        ? await db
              .update(lead)
              .set(updates)
              .where(eq(lead.id, input.id))
              .returning()
        : [currentLead];

    const explicitNote = sanitizeRequiredText(input.activityNote);
    const activityNote = [
        ...notes,
        ...(explicitNote ? [explicitNote] : []),
    ]
        .filter(Boolean)
        .join(". ");

    if (activityNote.length > 0) {
        await db.insert(activity).values({
            id: generateId(),
            leadId: input.id,
            type: "note",
            note: activityNote,
            timestamp: now,
        });
    }

    return updatedLead;
}
