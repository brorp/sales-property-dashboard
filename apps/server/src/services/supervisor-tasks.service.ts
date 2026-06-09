import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index";
import { activity, lead, user } from "../db/schema";
import { generateId } from "../utils/id";
import {
    getDeadlineLeadTaskSnapshotForManagedSales,
    getSubmittedDailyTaskSnapshotForManagedSales,
} from "./daily-task.service";

export async function listPendingHotLeads(params: {
    supervisorId: string;
    managedSalesIds: string[];
    clientId?: string | null;
}) {
    if (params.managedSalesIds.length === 0) {
        return [];
    }

    const conditions = [
        inArray(lead.assignedTo, params.managedSalesIds),
        eq(lead.salesStatus, "hot"),
        eq(lead.validated, false),
    ];
    if (params.clientId) {
        conditions.push(eq(lead.clientId, params.clientId));
    }

    const rows = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            salesStatus: lead.salesStatus,
            validated: lead.validated,
            flowStatus: lead.flowStatus,
            assignedTo: lead.assignedTo,
            assignedUserName: user.name,
            updatedAt: lead.updatedAt,
            createdAt: lead.createdAt,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(and(...conditions))
        .orderBy(desc(lead.updatedAt));

    return rows;
}

export async function validateHotLead(params: {
    leadId: string;
    supervisorId: string;
    supervisorName: string;
    managedSalesIds?: string[];
    clientId?: string | null;
}) {
    const [currentLead] = await db
        .select({
            id: lead.id,
            clientId: lead.clientId,
            salesStatus: lead.salesStatus,
            validated: lead.validated,
            assignedTo: lead.assignedTo,
        })
        .from(lead)
        .where(eq(lead.id, params.leadId))
        .limit(1);

    if (!currentLead) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (params.clientId && currentLead.clientId !== params.clientId) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (
        Array.isArray(params.managedSalesIds) &&
        params.managedSalesIds.length > 0 &&
        !params.managedSalesIds.includes(currentLead.assignedTo || "")
    ) {
        throw new Error("FORBIDDEN_HOT_LEAD");
    }

    if (currentLead.salesStatus !== "hot") {
        throw new Error("LEAD_NOT_HOT");
    }

    if (currentLead.validated) {
        throw new Error("LEAD_ALREADY_VALIDATED");
    }

    const now = new Date();

    await db
        .update(lead)
        .set({
            validated: true,
            updatedAt: now,
        })
        .where(eq(lead.id, params.leadId));

    await db.insert(activity).values({
        id: generateId(),
        leadId: params.leadId,
        type: "lead_status",
        note: `Lead HOT divalidasi oleh Supervisor ${params.supervisorName}. Status menjadi HOT | VALIDATED.`,
        timestamp: now,
    });

    return { success: true, leadId: params.leadId };
}

export async function rejectHotLead(params: {
    leadId: string;
    supervisorId: string;
    supervisorName: string;
    note?: string;
    managedSalesIds?: string[];
    clientId?: string | null;
}) {
    const [currentLead] = await db
        .select({
            id: lead.id,
            clientId: lead.clientId,
            salesStatus: lead.salesStatus,
            validated: lead.validated,
            assignedTo: lead.assignedTo,
        })
        .from(lead)
        .where(eq(lead.id, params.leadId))
        .limit(1);

    if (!currentLead) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (params.clientId && currentLead.clientId !== params.clientId) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (
        Array.isArray(params.managedSalesIds) &&
        params.managedSalesIds.length > 0 &&
        !params.managedSalesIds.includes(currentLead.assignedTo || "")
    ) {
        throw new Error("FORBIDDEN_HOT_LEAD");
    }

    if (currentLead.salesStatus !== "hot") {
        throw new Error("LEAD_NOT_HOT");
    }

    const now = new Date();

    await db
        .update(lead)
        .set({
            validated: false,
            updatedAt: now,
        })
        .where(eq(lead.id, params.leadId));

    const noteText = params.note
        ? `Lead HOT ditolak oleh Supervisor ${params.supervisorName}. Catatan: ${params.note}.`
        : `Lead HOT ditolak oleh Supervisor ${params.supervisorName}.`;

    await db.insert(activity).values({
        id: generateId(),
        leadId: params.leadId,
        type: "lead_status",
        note: noteText,
        timestamp: now,
    });

    return { success: true, leadId: params.leadId };
}

export async function listValidatedHotLeads(params: {
    salesId: string;
    clientId?: string | null;
}) {
    const conditions = [
        eq(lead.assignedTo, params.salesId),
        eq(lead.salesStatus, "hot"),
        eq(lead.validated, true),
        or(isNull(lead.resultStatus), eq(lead.resultStatus, "")),
    ];
    if (params.clientId) {
        conditions.push(eq(lead.clientId, params.clientId));
    }

    const rows = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
            validated: lead.validated,
            updatedAt: lead.updatedAt,
            createdAt: lead.createdAt,
        })
        .from(lead)
        .where(and(...conditions))
        .orderBy(desc(lead.updatedAt));

    return rows;
}

export async function listSubmittedDailyTasksByManagedSales(params: {
    managedSalesIds: string[];
    clientId?: string | null;
}) {
    return getSubmittedDailyTaskSnapshotForManagedSales({
        managedSalesIds: params.managedSalesIds,
        clientId: params.clientId || null,
    });
}

export async function listDeadlineLeadTasksByManagedSales(params: {
    managedSalesIds: string[];
    clientId?: string | null;
}) {
    return getDeadlineLeadTaskSnapshotForManagedSales({
        managedSalesIds: params.managedSalesIds,
        clientId: params.clientId || null,
    });
}
