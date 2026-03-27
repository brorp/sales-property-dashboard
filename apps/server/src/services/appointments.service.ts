import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index";
import { activity, appointment, lead, user } from "../db/schema";
import {
    resolveAppointmentTag,
    sanitizeAppointmentStatus,
    type AppointmentTag,
} from "../utils/appointment";
import { generateId } from "../utils/id";
import { getAppointmentStatusLabel } from "../utils/lead-workflow";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function buildScopeCondition(
    userId: string,
    role: string,
    scope?: { clientId?: string | null; managedSalesIds?: string[] }
) {
    if (role === "root_admin") {
        return undefined;
    }

    if (role === "client_admin" && scope?.clientId) {
        return eq(lead.clientId, scope.clientId);
    }

    if (role === "supervisor") {
        if (scope?.managedSalesIds?.length) {
            return inArray(lead.assignedTo, scope.managedSalesIds);
        }
        return eq(lead.assignedTo, "__none__");
    }

    return or(eq(appointment.salesId, userId), eq(lead.assignedTo, userId));
}

export async function listAppointments(
    userId: string,
    role: string,
    scope?: { clientId?: string | null; managedSalesIds?: string[] },
    filters?: { salesId?: string | null }
) {
    const conditions = [buildScopeCondition(userId, role, scope)];

    if (filters?.salesId) {
        conditions.push(eq(appointment.salesId, filters.salesId));
    }

    const rows = await db
        .select({
            id: appointment.id,
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            leadSource: lead.source,
            assignedTo: lead.assignedTo,
            salesId: appointment.salesId,
            salesName: user.name,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            location: appointment.location,
            notes: appointment.notes,
            createdAt: appointment.createdAt,
            updatedAt: appointment.updatedAt,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .leftJoin(user, eq(appointment.salesId, user.id))
        .where(and(...conditions.filter(Boolean)))
        .orderBy(desc(appointment.date), desc(appointment.time), desc(appointment.createdAt));

    return rows.map((row) => ({
        ...row,
        appointmentTag: resolveAppointmentTag(row),
    }));
}

export async function getAppointmentById(id: string) {
    const [row] = await db
        .select({
            id: appointment.id,
            leadId: appointment.leadId,
            salesId: appointment.salesId,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            location: appointment.location,
            notes: appointment.notes,
            createdAt: appointment.createdAt,
            updatedAt: appointment.updatedAt,
        })
        .from(appointment)
        .where(eq(appointment.id, id))
        .limit(1);

    return row || null;
}

export async function updateAppointment(params: {
    appointmentId: string;
    actorId: string;
    date?: string;
    time?: string;
    status?: string;
    location?: string;
    notes?: string | null;
}) {
    const existing = await getAppointmentById(params.appointmentId);
    if (!existing) {
        return null;
    }

    const updates: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (typeof params.date === "string" && params.date.trim()) {
        updates.date = params.date.trim();
    }
    if (typeof params.time === "string" && params.time.trim()) {
        updates.time = params.time.trim();
    }
    if (typeof params.location === "string" && params.location.trim()) {
        updates.location = params.location.trim();
    }
    if (params.notes !== undefined) {
        const normalizedNotes = typeof params.notes === "string" ? params.notes.trim() : "";
        updates.notes = normalizedNotes || null;
    }
    if (params.status !== undefined) {
        updates.status = sanitizeAppointmentStatus(params.status);
    }

    const [updated] = await db
        .update(appointment)
        .set(updates)
        .where(eq(appointment.id, params.appointmentId))
        .returning();

    const target = updated || existing;
    const appointmentStatus = sanitizeAppointmentStatus(target.status);
    const previousStatus = sanitizeAppointmentStatus(existing.status);
    const activityType =
        params.status !== undefined && appointmentStatus !== previousStatus
            ? "survey"
            : "appointment";
    const note =
        params.status !== undefined && appointmentStatus !== previousStatus
            ? `Status survey diubah dari ${getAppointmentStatusLabel(previousStatus)} ke ${getAppointmentStatusLabel(appointmentStatus)}`
            : `Appointment diperbarui untuk ${target.date} ${target.time} di ${target.location}`;

    await db.insert(activity).values({
        id: generateId(),
        leadId: target.leadId,
        type: activityType,
        note,
        timestamp: new Date(),
    });

    return {
        ...target,
        appointmentTag: resolveAppointmentTag(target),
    };
}

export async function cancelAppointment(params: {
    appointmentId: string;
    actorId: string;
    notes?: string | null;
}) {
    return updateAppointment({
        appointmentId: params.appointmentId,
        actorId: params.actorId,
        status: "dibatalkan",
        notes: params.notes,
    });
}

export async function countAppointmentsForSalesIds(salesIds: string[]) {
    if (salesIds.length === 0) {
        return new Map<string, number>();
    }

    const rows = await db
        .select({
            salesId: appointment.salesId,
        })
        .from(appointment)
        .where(
            and(
                inArray(appointment.salesId, salesIds),
                inArray(appointment.status, ["mau_survey", "sudah_survey"])
            )
        );

    const map = new Map<string, number>();
    for (const row of rows) {
        if (!row.salesId) {
            continue;
        }
        map.set(row.salesId, (map.get(row.salesId) || 0) + 1);
    }

    return map;
}

export function isEditableAppointmentStatus(status: string | null | undefined) {
    return sanitizeAppointmentStatus(status) as Exclude<AppointmentTag, "none">;
}

export async function syncLeadAppointmentsSalesOwner(params: {
    leadId: string;
    salesId: string | null;
    executor?: DbExecutor;
}) {
    const executor = params.executor || db;

    await executor
        .update(appointment)
        .set({
            salesId: params.salesId,
            updatedAt: new Date(),
        })
        .where(eq(appointment.leadId, params.leadId));
}
