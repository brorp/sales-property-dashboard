import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index";
import { appointment, lead, user } from "../db/schema";
import { resolveAppointmentTag } from "../utils/appointment";

export async function listAppointments(
    userId: string,
    role: string,
    scope?: { clientId?: string | null; managedSalesIds?: string[] }
) {
    let condition: any = undefined;

    if (role === "root_admin") {
        condition = undefined;
    } else if (role === "client_admin" && scope?.clientId) {
        condition = eq(lead.clientId, scope.clientId);
    } else if (role === "supervisor") {
        if (scope?.managedSalesIds?.length) {
            condition = inArray(lead.assignedTo, scope.managedSalesIds);
        } else {
            condition = eq(lead.assignedTo, "__none__");
        }
    } else {
        condition = or(eq(appointment.salesId, userId), eq(lead.assignedTo, userId));
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
