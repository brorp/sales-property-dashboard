import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../db/index";
import {
    activity,
    appointment,
    lead,
    projectUnit,
    user,
    waMessage,
} from "../db/schema";
import { generateId } from "../utils/id";
import {
    resolveAppointmentTag,
    toAppointmentDateTime,
    type AppointmentTag,
} from "../utils/appointment";
import { createGoogleCalendarEvent } from "./calendar.service";
import { syncLeadAppointmentsSalesOwner } from "./appointments.service";
import { normalizeFixedLeadSource } from "../constants/lead-sources";
import * as cancelReasonsService from "./cancel-reasons.service";
import * as dailyTaskService from "./daily-task.service";
import {
    getFlowStatusLabel,
    getResultStatusLabel,
    getSalesStatusLabel,
    normalizeFlowStatus,
    normalizeResultStatus,
    normalizeSalesStatus,
    canManuallySetSalesStatus,
} from "../utils/lead-workflow";

interface LeadFilters {
    search?: string;
    flowStatus?: string;
    salesStatus?: string;
    resultStatus?: string;
    assignedTo?: string;
    appointmentTag?: string;
    domicileCity?: string;
    source?: string;
}

export type LeadPatchInput = {
    id: string;
    actorId: string;
    actorRole: string;
    actorClientId?: string | null;
    managedSalesIds?: string[];
    name?: string;
    domicileCity?: string | null;
    salesStatus?: string | null;
    interestUnitId?: string | null;
    resultStatus?: string | null;
    unitName?: string | null;
    unitDetail?: string | null;
    paymentMethod?: string | null;
    rejectedReason?: string | null;
    rejectedNote?: string | null;
    assignedTo?: string | null;
    activityNote?: string;
};

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

function sanitizeRequiredText(value: unknown) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function isLayer2FlowStatus(flowStatus: string | null | undefined) {
    return flowStatus === "accepted";
}

function mapAppointmentTagFilter(value: string | undefined) {
    if (!value || value === "all") {
        return undefined;
    }
    if (
        value !== "mau_survey" &&
        value !== "sudah_survey" &&
        value !== "dibatalkan" &&
        value !== "none"
    ) {
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
            status: appointment.status,
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
    role: string,
    scope?: { clientId?: string | null; managedSalesIds?: string[] }
) {
    const conditions: Array<any> = [];

    // ─── Role-based data scoping ─────────────────────────────────────
    if (role === "root_admin") {
        // root_admin: no lead scoping (sees everything)
    } else {
        if (scope?.clientId) {
            conditions.push(eq(lead.clientId, scope.clientId));
        }

        if (role === "client_admin") {
            // client_admin: all operational data inside active workspace
        } else if (role === "supervisor") {
            if (scope?.managedSalesIds && scope.managedSalesIds.length > 0) {
                conditions.push(inArray(lead.assignedTo, scope.managedSalesIds));
            } else {
                conditions.push(eq(lead.assignedTo, "__none__"));
            }
        } else {
            // sales: only own leads inside active workspace
            conditions.push(eq(lead.assignedTo, userId));
        }
    }

    if (filters.flowStatus && filters.flowStatus !== "all") {
        conditions.push(eq(lead.flowStatus, filters.flowStatus));
    }

    if (filters.salesStatus && filters.salesStatus !== "all") {
        if (filters.salesStatus === "hot_validated") {
            conditions.push(eq(lead.salesStatus, "hot"));
            conditions.push(eq(lead.validated, true));
        } else {
            conditions.push(eq(lead.salesStatus, filters.salesStatus));
        }
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

    if (filters.source && filters.source !== "all") {
        conditions.push(eq(lead.source, filters.source));
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
            interestUnitId: lead.interestUnitId,
            interestProjectType: lead.interestProjectType,
            interestUnitName: lead.interestUnitName,
            resultStatus: lead.resultStatus,
            validated: lead.validated,
            unitName: lead.unitName,
            unitDetail: lead.unitDetail,
            paymentMethod: lead.paymentMethod,
            rejectedReason: lead.rejectedReason,
            rejectedNote: lead.rejectedNote,
            acceptedAt: lead.acceptedAt,
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
    const acceptedLeadIds = rowsWithTag
        .filter((row) => row.flowStatus === "accepted")
        .map((row) => row.id);
    const pipelineProgressMap = await dailyTaskService.getLeadFollowUpProgressMap(acceptedLeadIds);

    const rowsWithPipeline = rowsWithTag.map((row) => ({
        ...row,
        customerPipelineCompletedCount:
            row.flowStatus === "accepted"
                ? pipelineProgressMap.get(row.id)?.completedCount || 0
                : 0,
        customerPipelineTotalSteps:
            row.flowStatus === "accepted"
                ? pipelineProgressMap.get(row.id)?.totalSteps || 3
                : 0,
    }));
    const requestedTag = mapAppointmentTagFilter(filters.appointmentTag);
    if (!requestedTag) {
        return rowsWithPipeline;
    }

    return rowsWithPipeline.filter((row) => row.appointmentTag === requestedTag);
}

export async function findById(id: string) {
    const [leadData] = await db.select().from(lead).where(eq(lead.id, id)).limit(1);
    if (!leadData) {
        return null;
    }

    const normalizedFlowStatus = normalizeFlowStatus(leadData.flowStatus, leadData.assignedTo);
    if (normalizedFlowStatus === "accepted" || normalizedFlowStatus === "assigned") {
        await dailyTaskService.syncLeadDailyTasksForLead(id);
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

    const [activities, appointments, assignedUser, followUpProgress] = await Promise.all([
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
        normalizedFlowStatus === "accepted"
            ? dailyTaskService.getLeadFollowUpProgress(id)
            : Promise.resolve({
                completedCount: 0,
                totalSteps: 3,
                stages: [],
            }),
    ]);

    const latestAppointment = pickLatestAppointment(appointments);

    return {
        ...leadData,
        flowStatus: normalizedFlowStatus,
        appointmentTag: resolveAppointmentTag(latestAppointment || null),
        latestAppointment: latestAppointment || null,
        activities,
        appointments,
        customerPipeline: followUpProgress.stages,
        customerPipelineCompletedCount: followUpProgress.completedCount,
        customerPipelineTotalSteps: followUpProgress.totalSteps,
        assignedUser: assignedUser[0] || null,
    };
}

export async function deleteLead(params: {
    leadId: string;
    actorId: string;
    actorRole: string;
    actorClientId?: string | null;
}) {
    const [existingLead] = await db
        .select({
            id: lead.id,
            clientId: lead.clientId,
            name: lead.name,
            phone: lead.phone,
        })
        .from(lead)
        .where(eq(lead.id, params.leadId))
        .limit(1);

    if (!existingLead) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (
        params.actorRole !== "root_admin" &&
        params.actorRole !== "client_admin"
    ) {
        throw new Error("FORBIDDEN");
    }

    if (
        params.actorClientId &&
        existingLead.clientId &&
        existingLead.clientId !== params.actorClientId
    ) {
        throw new Error("FORBIDDEN_LEAD_DELETE");
    }

    await db.transaction(async (tx) => {
        await tx.delete(waMessage).where(eq(waMessage.leadId, existingLead.id));
        await tx.delete(lead).where(eq(lead.id, existingLead.id));
    });

    return existingLead;
}

export async function create(data: {
    name: string;
    phone: string;
    source: string;
    assignedTo?: string | null;
    clientId?: string | null;
}) {
    const id = generateId();
    const now = new Date();
    const assignedTo = data.assignedTo || null;
    let resolvedClientId = data.clientId || null;
    const normalizedSource = normalizeFixedLeadSource(data.source) || "Online";

    if (assignedTo) {
        const [assignedSales] = await db
            .select({
                clientId: user.clientId,
                role: user.role,
                isActive: user.isActive,
            })
            .from(user)
            .where(eq(user.id, assignedTo))
            .limit(1);

        if (!assignedSales || assignedSales.role !== "sales" || !assignedSales.isActive) {
            throw new Error("INVALID_ASSIGNED_SALES");
        }
        
        // Multi-workspace: Allow assigning cross-workspace since users are shared.
        // The resolvedClientId remains the target workspace ID.
    }

    if (resolvedClientId && !normalizeFixedLeadSource(normalizedSource)) {
        throw new Error("INVALID_LEAD_SOURCE");
    }

    const [newLead] = await db
        .insert(lead)
        .values({
            id,
            name: data.name,
            phone: data.phone,
            source: normalizedSource,
            assignedTo,
            clientId: resolvedClientId,
            flowStatus: assignedTo ? "assigned" : "open",
            salesStatus: null,
            domicileCity: null,
            resultStatus: null,
            interestUnitId: null,
            interestProjectType: null,
            interestUnitName: null,
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

    if (assignedTo) {
        await dailyTaskService.createNewLeadTaskForLead({
            leadId: id,
            salesId: assignedTo,
            clientId: resolvedClientId,
            assignedAt: now,
        });
    }

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
            clientId: lead.clientId,
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

    const [salesRow] = await db
        .select({
            id: user.id,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, data.salesId))
        .limit(1);

    // Multi-workspace: Remove salesRow.clientId !== currentLead.clientId
    if (!salesRow || salesRow.role !== "sales" || !salesRow.isActive) {
        throw new Error("INVALID_ASSIGNED_SALES");
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

    await dailyTaskService.createNewLeadTaskForLead({
        leadId: data.leadId,
        salesId: data.salesId,
        clientId: currentLead.clientId || null,
        assignedAt: now,
    });

    await syncLeadAppointmentsSalesOwner({
        leadId: data.leadId,
        salesId: data.salesId,
    });

    return updated;
}

export async function acceptLead(data: {
    leadId: string;
    actorId: string;
    actorName: string;
}) {
    const [currentLead] = await db
        .select({
            id: lead.id,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
        })
        .from(lead)
        .where(eq(lead.id, data.leadId))
        .limit(1);

    if (!currentLead) {
        throw new Error("LEAD_NOT_FOUND");
    }

    const normalizedFlowStatus = normalizeFlowStatus(currentLead.flowStatus, currentLead.assignedTo);
    if (currentLead.assignedTo !== data.actorId) {
        throw new Error("FORBIDDEN_LEAD_ACCEPT");
    }

    if (normalizedFlowStatus !== "assigned") {
        throw new Error("LEAD_ACCEPT_REQUIRES_ASSIGNED");
    }

    const now = new Date();

    await db.transaction(async (tx) => {
        await tx
            .update(lead)
            .set({
                flowStatus: "accepted",
                salesStatus: "warm",
                clientStatus: "warm",
                layer2Status: "warm",
                acceptedAt: now,
                updatedAt: now,
            })
            .where(eq(lead.id, data.leadId));

        await tx.insert(activity).values({
            id: generateId(),
            leadId: data.leadId,
            type: "lead_status",
            note: `Lead diterima oleh ${data.actorName}. Status L1 berubah dari ${getFlowStatusLabel(normalizedFlowStatus)} ke ${getFlowStatusLabel("accepted")}. Status L2 otomatis berubah menjadi ${getSalesStatusLabel("warm")}.`,
            timestamp: now,
        });

        await dailyTaskService.syncLeadDailyTasksForLead(data.leadId, tx, now);
    });

    return findById(data.leadId);
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

export async function completeCustomerPipelineStep(params: {
    leadId: string;
    stepNo: number;
    note?: string | null;
    actorId: string;
    actorName: string;
}) {
    throw new Error("CUSTOMER_PIPELINE_MANUAL_DISABLED");
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

    // Guard: reject if there's already an active (mau_survey) appointment
    const [existingActive] = await db
        .select({ id: appointment.id })
        .from(appointment)
        .where(and(eq(appointment.leadId, leadId), eq(appointment.status, "mau_survey")))
        .limit(1);

    if (existingActive) {
        throw new Error("Tidak dapat menambahkan karena sedang ada appointment berjalan");
    }

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
        .select({
            name: lead.name,
            phone: lead.phone,
            salesStatus: lead.salesStatus,
        })
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
            status: "mau_survey",
            location: data.location,
            notes: data.notes || null,
            googleEventId: calendar.eventId,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    await db.transaction(async (tx) => {
        await tx.insert(activity).values({
            id: generateId(),
            leadId,
            type: "appointment",
            note: `Appointment dibuat untuk ${data.date} ${data.time} di ${data.location} dengan status ${resolveAppointmentTag(newAppointment) === "mau_survey" ? "Mau Survey" : resolveAppointmentTag(newAppointment)}`,
            timestamp: now,
        });

        const shouldPromoteToHot = normalizeSalesStatus(leadRow?.salesStatus) !== "hot";

        await tx
            .update(lead)
            .set({
                salesStatus: "hot",
                clientStatus: "hot",
                layer2Status: "hot",
                updatedAt: now,
            })
            .where(eq(lead.id, leadId));

        if (shouldPromoteToHot) {
            await tx.insert(activity).values({
                id: generateId(),
                leadId,
                type: "appointment",
                note: "Appointment dibuat, status L2 otomatis berubah menjadi Hot",
                timestamp: now,
            });
        }

        await dailyTaskService.syncLeadDailyTasksForLead(leadId, tx, now);
    });

    return newAppointment;
}

export async function getLeadAppointmentTag(leadId: string) {
    const rows = await db
        .select({
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
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

    const isAdminRole = input.actorRole === "client_admin" || input.actorRole === "root_admin";

    if (
        input.actorRole === "client_admin" &&
        input.actorClientId &&
        currentLead.clientId !== input.actorClientId
    ) {
        throw new Error("FORBIDDEN_LEAD_EDIT");
    }

    if (
        input.actorRole === "supervisor" &&
        !input.managedSalesIds?.includes(currentLead.assignedTo || "")
    ) {
        throw new Error("FORBIDDEN_LEAD_EDIT");
    }

    if (isAdminRole && currentLead.assignedTo) {
        throw new Error("ADMIN_ASSIGNED_LEAD_READ_ONLY");
    }

    if (!isAdminRole && input.actorRole !== "supervisor" && currentLead.assignedTo !== input.actorId) {
        throw new Error("FORBIDDEN_LEAD_EDIT");
    }

    // Supervisor can edit leads of their managed sales
    if (input.actorRole === "supervisor" && currentLead.assignedTo !== input.actorId) {
        // Allow if the lead is assigned to one of supervisor's managed sales
        // (scope checking should happen at the route level)
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
        updatedAt: now,
    };
    const activityEntries: Array<{ type: string; note: string }> = [];
    const currentNormalizedFlowStatus = normalizeFlowStatus(
        currentLead.flowStatus,
        currentLead.assignedTo
    );

    const nextName = sanitizeRequiredText(input.name);
    if (typeof nextName === "string" && nextName !== currentLead.name) {
        updates.name = nextName;
        activityEntries.push({
            type: "note",
            note: `Nama lead diubah ke ${nextName}`,
        });
    }

    if (input.assignedTo !== undefined) {
        if (!isAdminRole && input.actorRole !== "supervisor") {
            throw new Error("FORBIDDEN_ASSIGN");
        }
        const nextAssignedTo = sanitizeNullableText(input.assignedTo);
        if (nextAssignedTo !== undefined && nextAssignedTo !== currentLead.assignedTo) {
            if (nextAssignedTo) {
                const [nextSales] = await db
                    .select({
                        id: user.id,
                        role: user.role,
                        clientId: user.clientId,
                        isActive: user.isActive,
                        name: user.name,
                    })
                    .from(user)
                    .where(eq(user.id, nextAssignedTo))
                    .limit(1);

                if (!nextSales || nextSales.role !== "sales" || !nextSales.isActive) {
                    throw new Error("INVALID_ASSIGNED_SALES");
                }

                if (
                    input.actorRole === "supervisor" &&
                    !input.managedSalesIds?.includes(nextAssignedTo)
                ) {
                    throw new Error("FORBIDDEN_ASSIGN");
                }

                updates.assignedTo = nextAssignedTo;
                updates.flowStatus = "assigned";
                updates.acceptedAt = null;
                activityEntries.push({
                    type: "lead_status",
                    note: `Lead di-assign ke ${nextSales.name}`,
                });
            } else {
                updates.assignedTo = null;
                updates.flowStatus = "open";
                updates.acceptedAt = null;
                activityEntries.push({
                    type: "lead_status",
                    note: "Assignment lead dilepas",
                });
            }
        }
    }

    const nextFlowStatus =
        (typeof updates.flowStatus === "string"
            ? updates.flowStatus
            : currentNormalizedFlowStatus) || "open";

    if (input.domicileCity !== undefined) {
        const nextCity = sanitizeNullableText(input.domicileCity);
        if (nextCity !== undefined && nextCity !== currentLead.domicileCity) {
            if (nextCity && nextFlowStatus !== "accepted") {
                throw new Error("DOMICILE_REQUIRES_ACCEPTED");
            }
            updates.domicileCity = nextCity;
            activityEntries.push({
                type: "lead_status",
                note: `Domisili diubah ke ${nextCity || "-"}`,
            });
        }
    }

    if (input.salesStatus !== undefined) {
        const nextSalesStatus = input.salesStatus === null ? null : normalizeSalesStatus(input.salesStatus);
        if (input.salesStatus && !nextSalesStatus) {
            throw new Error("INVALID_SALES_STATUS");
        }
        if (nextSalesStatus && !isLayer2FlowStatus(nextFlowStatus)) {
            throw new Error("SALES_STATUS_REQUIRES_ACCEPTED");
        }
        if (
            nextSalesStatus &&
            nextSalesStatus !== currentLead.salesStatus &&
            !canManuallySetSalesStatus(nextSalesStatus, currentLead.createdAt)
        ) {
            throw new Error("SALES_STATUS_TOO_EARLY");
        }
        if (nextSalesStatus !== currentLead.salesStatus) {
            updates.salesStatus = nextSalesStatus;
            updates.clientStatus = nextSalesStatus || currentLead.clientStatus;
            updates.layer2Status = nextSalesStatus || currentLead.layer2Status;
            activityEntries.push({
                type: "lead_status",
                note: `Status L2 berubah dari ${getSalesStatusLabel(currentLead.salesStatus)} ke ${getSalesStatusLabel(nextSalesStatus)}`,
            });
        }
    }

    if (input.interestUnitId !== undefined) {
        const nextInterestUnitId = sanitizeNullableText(input.interestUnitId);

        if (nextInterestUnitId && !isLayer2FlowStatus(nextFlowStatus)) {
            throw new Error("INTEREST_UNIT_REQUIRES_ACCEPTED");
        }

        if (nextInterestUnitId !== currentLead.interestUnitId) {
            if (!nextInterestUnitId) {
                updates.interestUnitId = null;
                updates.interestProjectType = null;
                updates.interestUnitName = null;
                activityEntries.push({
                    type: "lead_status",
                    note: "Tipe unit dihapus",
                });
            } else {
                const [unitRow] = await db
                    .select({
                        id: projectUnit.id,
                        clientId: projectUnit.clientId,
                        projectType: projectUnit.projectType,
                        unitName: projectUnit.unitName,
                    })
                    .from(projectUnit)
                    .where(eq(projectUnit.id, nextInterestUnitId))
                    .limit(1);

                if (!unitRow) {
                    throw new Error("INVALID_INTEREST_UNIT");
                }

                if (
                    currentLead.clientId &&
                    unitRow.clientId &&
                    unitRow.clientId !== currentLead.clientId
                ) {
                    throw new Error("INVALID_INTEREST_UNIT");
                }

                updates.interestUnitId = unitRow.id;
                updates.interestProjectType = unitRow.projectType;
                updates.interestUnitName = unitRow.unitName;
                activityEntries.push({
                    type: "lead_status",
                    note: `Tipe unit diubah ke ${unitRow.projectType} - ${unitRow.unitName}`,
                });
            }
        }
    }

    const nextResultStatusRaw =
        input.resultStatus !== undefined
            ? normalizeResultStatus(input.resultStatus)
            : normalizeResultStatus(currentLead.resultStatus);
    const isResultStatusUpdated = input.resultStatus !== undefined;
    const isAkadFieldUpdated =
        input.unitName !== undefined ||
        input.unitDetail !== undefined ||
        input.paymentMethod !== undefined;
    const isCancelFieldUpdated =
        input.rejectedReason !== undefined || input.rejectedNote !== undefined;

    if (input.resultStatus && !nextResultStatusRaw) {
        throw new Error("INVALID_RESULT_STATUS");
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
    const nextCancelReason =
        input.rejectedReason !== undefined
            ? sanitizeNullableText(input.rejectedReason)
            : currentLead.rejectedReason;
    const nextCancelNote =
        input.rejectedNote !== undefined
            ? sanitizeNullableText(input.rejectedNote)
            : currentLead.rejectedNote;

    if ((isResultStatusUpdated || isAkadFieldUpdated) && nextResultStatusRaw === "akad") {
        if (!nextUnitName || !nextUnitDetail || !nextPaymentMethod) {
            throw new Error("CLOSING_FIELDS_REQUIRED");
        }
        updates.unitName = nextUnitName;
        updates.unitDetail = nextUnitDetail;
        updates.paymentMethod = nextPaymentMethod;
        updates.rejectedReason = null;
        updates.rejectedNote = null;
    } else if (isAkadFieldUpdated && nextResultStatusRaw !== "akad") {
        throw new Error("CLOSING_FIELDS_REQUIRE_AKAD_STATUS");
    }

    if ((isResultStatusUpdated || isCancelFieldUpdated) && nextResultStatusRaw === "cancel") {
        if (!nextCancelReason) {
            throw new Error("CANCEL_REASON_REQUIRED");
        }
        if (!nextCancelNote) {
            throw new Error("CANCEL_NOTES_REQUIRED");
        }

        await cancelReasonsService.assertActiveCancelReason(currentLead.clientId, nextCancelReason);

        updates.rejectedReason = nextCancelReason;
        updates.rejectedNote = nextCancelNote;
        updates.unitName = null;
        updates.unitDetail = null;
        updates.paymentMethod = null;

        if (normalizeSalesStatus(currentLead.salesStatus) !== "skip") {
            updates.salesStatus = "skip";
            updates.clientStatus = "skip";
            updates.layer2Status = "skip";
            activityEntries.push({
                type: "lead_status",
                note: `Status L2 berubah dari ${getSalesStatusLabel(currentLead.salesStatus)} ke ${getSalesStatusLabel("skip")} otomatis karena result status ${getResultStatusLabel("cancel")}`,
            });
        }
    } else if (isCancelFieldUpdated && nextResultStatusRaw !== "cancel") {
        throw new Error("CANCEL_REASON_REQUIRES_CANCEL_STATUS");
    }

    if (isResultStatusUpdated) {
        updates.resultStatus = nextResultStatusRaw;

        if (nextResultStatusRaw !== "cancel" && nextResultStatusRaw !== "akad") {
            updates.rejectedReason = null;
            updates.rejectedNote = null;
        }

        if (nextResultStatusRaw !== "akad" && nextResultStatusRaw !== "cancel" && !isAkadFieldUpdated) {
            updates.unitName = currentLead.unitName;
            updates.unitDetail = currentLead.unitDetail;
            updates.paymentMethod = currentLead.paymentMethod;
        }

        activityEntries.push({
            type: "result_status",
            note: `Result status diubah dari ${getResultStatusLabel(currentLead.resultStatus)} ke ${getResultStatusLabel(nextResultStatusRaw)}`,
        });
    }

    const willUpdate = Object.keys(updates).length > 1;
    const [updatedLead] = willUpdate
        ? await db
            .update(lead)
            .set(updates)
            .where(eq(lead.id, input.id))
            .returning()
        : [currentLead];

    if (updates.assignedTo !== undefined) {
        await syncLeadAppointmentsSalesOwner({
            leadId: input.id,
            salesId:
                typeof updates.assignedTo === "string"
                    ? updates.assignedTo
                    : updates.assignedTo === null
                        ? null
                        : updatedLead.assignedTo || null,
        });

        const nextAssignedSalesId =
            typeof updates.assignedTo === "string"
                ? updates.assignedTo
                : updates.assignedTo === null
                    ? null
                    : updatedLead.assignedTo || null;

        if (nextAssignedSalesId) {
            await dailyTaskService.createNewLeadTaskForLead({
                leadId: input.id,
                salesId: nextAssignedSalesId,
                clientId: updatedLead.clientId || input.actorClientId || null,
                assignedAt: now,
            });
        } else {
            await dailyTaskService.invalidateDailyTasksForLead(input.id);
        }
    }

    const explicitNote = sanitizeRequiredText(input.activityNote);
    if (explicitNote) {
        activityEntries.push({
            type: "note",
            note: explicitNote,
        });
    }

    for (const entry of activityEntries) {
        await db.insert(activity).values({
            id: generateId(),
            leadId: input.id,
            type: entry.type,
            note: entry.note,
            timestamp: now,
        });
    }

    await dailyTaskService.syncLeadDailyTasksForLead(input.id);

    return updatedLead;
}
