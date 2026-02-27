import { desc, eq, or } from "drizzle-orm";
import { db } from "../db";
import { appointment, lead, user } from "../db/schema";
import { resolveAppointmentTag } from "../utils/appointment";

export async function listAppointments(userId: string, role: string) {
    const condition =
        role === "admin"
            ? undefined
            : or(eq(appointment.salesId, userId), eq(lead.assignedTo, userId));

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
            location: appointment.location,
            notes: appointment.notes,
            createdAt: appointment.createdAt,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .leftJoin(user, eq(appointment.salesId, user.id))
        .where(condition)
        .orderBy(desc(appointment.date), desc(appointment.time), desc(appointment.createdAt));

    return rows.map((row) => ({
        ...row,
        appointmentTag: resolveAppointmentTag({
            date: row.date,
            time: row.time,
        }),
    }));
}
