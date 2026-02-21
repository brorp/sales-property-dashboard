import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import {
    activity,
    appointment,
    lead,
    leadProgressHistory,
    leadStatusHistory,
    user,
} from "../db/schema";
import { generateId } from "../utils/id";
import { createGoogleCalendarEvent } from "./calendar.service";

interface LeadFilters {
    search?: string;
    clientStatus?: string;
    progress?: string;
    assignedTo?: string;
}

export async function findAll(
    filters: LeadFilters,
    userId: string,
    role: string
) {
    const conditions: any[] = [];

    if (role !== "admin") {
        conditions.push(eq(lead.assignedTo, userId));
    }

    if (filters.clientStatus && filters.clientStatus !== "all") {
        conditions.push(eq(lead.clientStatus, filters.clientStatus));
    }

    if (filters.progress && filters.progress !== "all") {
        conditions.push(eq(lead.progress, filters.progress));
    }

    if (filters.assignedTo && filters.assignedTo !== "all") {
        conditions.push(eq(lead.assignedTo, filters.assignedTo));
    }

    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        conditions.push(
            or(ilike(lead.name, searchPattern), ilike(lead.phone, searchPattern))
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            assignedTo: lead.assignedTo,
            clientStatus: lead.clientStatus,
            progress: lead.progress,
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

    const [activities, appointments, assignedUser, statusHistory, progressHistory] =
        await Promise.all([
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
            db
                .select()
                .from(leadStatusHistory)
                .where(eq(leadStatusHistory.leadId, id))
                .orderBy(desc(leadStatusHistory.changedAt)),
            db
                .select()
                .from(leadProgressHistory)
                .where(eq(leadProgressHistory.leadId, id))
                .orderBy(desc(leadProgressHistory.changedAt)),
        ]);

    return {
        ...leadData,
        activities,
        appointments,
        statusHistory,
        progressHistory,
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

    const [newLead] = await db
        .insert(lead)
        .values({
            id,
            name: data.name,
            phone: data.phone,
            source: data.source || "Manual Input",
            assignedTo: data.assignedTo || null,
            clientStatus: "warm",
            progress: "new",
            receivedAt: now,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    await db.insert(activity).values({
        id: generateId(),
        leadId: id,
        type: "new",
        note: "Lead baru ditambahkan",
        timestamp: now,
    });

    return newLead;
}

export async function updateLeadStatus(data: {
    leadId: string;
    newStatus: string;
    changedBy?: string;
    note?: string;
}) {
    const [current] = await db
        .select({ id: lead.id, oldStatus: lead.clientStatus })
        .from(lead)
        .where(eq(lead.id, data.leadId))
        .limit(1);

    if (!current) {
        return null;
    }

    const now = new Date();

    const [updated] = await db
        .update(lead)
        .set({
            clientStatus: data.newStatus,
            updatedAt: now,
        })
        .where(eq(lead.id, data.leadId))
        .returning();

    await db.insert(leadStatusHistory).values({
        id: generateId(),
        leadId: data.leadId,
        oldStatus: current.oldStatus,
        newStatus: data.newStatus,
        changedBy: data.changedBy || null,
        changedAt: now,
        note: data.note || null,
    });

    await db.insert(activity).values({
        id: generateId(),
        leadId: data.leadId,
        type: "note",
        note: `Client status: ${current.oldStatus} -> ${data.newStatus}${data.note ? ` (${data.note})` : ""}`,
        timestamp: now,
    });

    return updated;
}

export async function updateLeadProgress(data: {
    leadId: string;
    newProgress: string;
    changedBy?: string;
    note?: string;
}) {
    const [current] = await db
        .select({ id: lead.id, oldProgress: lead.progress })
        .from(lead)
        .where(eq(lead.id, data.leadId))
        .limit(1);

    if (!current) {
        return null;
    }

    const now = new Date();
    const [updated] = await db
        .update(lead)
        .set({
            progress: data.newProgress,
            updatedAt: now,
        })
        .where(eq(lead.id, data.leadId))
        .returning();

    await db.insert(leadProgressHistory).values({
        id: generateId(),
        leadId: data.leadId,
        oldProgress: current.oldProgress,
        newProgress: data.newProgress,
        changedBy: data.changedBy || null,
        changedAt: now,
        note: data.note || null,
    });

    await db.insert(activity).values({
        id: generateId(),
        leadId: data.leadId,
        type: data.newProgress,
        note: `Progress: ${current.oldProgress} -> ${data.newProgress}${data.note ? ` (${data.note})` : ""}`,
        timestamp: now,
    });

    return updated;
}

export async function assignLead(data: {
    leadId: string;
    salesId: string;
    changedBy?: string;
    note?: string;
}) {
    const now = new Date();
    const [updated] = await db
        .update(lead)
        .set({
            assignedTo: data.salesId,
            updatedAt: now,
        })
        .where(eq(lead.id, data.leadId))
        .returning();

    if (!updated) {
        return null;
    }

    await db.insert(activity).values({
        id: generateId(),
        leadId: data.leadId,
        type: "follow-up",
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
    const startAt = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
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

    await updateLeadProgress({
        leadId,
        newProgress: "appointment",
        changedBy: data.salesId,
        note: `Appointment ${data.date} ${data.time} di ${data.location}`,
    });

    return newAppointment;
}
