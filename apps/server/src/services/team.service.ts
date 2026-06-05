import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import {
    activity,
    client,
    dailyTaskPenalty,
    dailyTaskPenaltySuspension,
    lead,
    session,
    teamGroup,
    teamGroupMember,
    user,
} from "../db/schema";
import type { QueryScope } from "../middleware/rbac";
import { countAppointmentsForSalesIds } from "./appointments.service";
import { getActiveSalesSuspensionMap } from "./sales-suspension.service";
import { normalizeResultStatus } from "../utils/lead-workflow";
import { generateId } from "../utils/id";

function createEmptyStats() {
    return {
        totalLeads: 0,
        accepted: 0,
        closed: 0,
        hot: 0,
        appointments: 0,
        pending: 0,
        closeRate: 0,
    };
}

function toCloseRate(closed: number, totalLeads: number) {
    if (totalLeads <= 0) {
        return 0;
    }

    return Math.round((closed / totalLeads) * 100);
}

function buildStatsFromLeads(items: Array<{
    flowStatus: string | null;
    salesStatus: string | null;
    resultStatus: string | null;
}>) {
    const totalLeads = items.length;
    const accepted = items.filter((item) => item.flowStatus === "accepted").length;
    const closed = items.filter(
        (item) => {
            const resultStatus = normalizeResultStatus(item.resultStatus);
            return resultStatus === "lunas" || resultStatus === "full_book";
        }
    ).length;
    const hot = items.filter((item) => item.salesStatus === "hot").length;
    const pending = items.filter(
        (item) =>
            item.flowStatus === "open" ||
            normalizeResultStatus(item.resultStatus) === "reserve" ||
            !item.resultStatus
    ).length;

    return {
        totalLeads,
        accepted,
        closed,
        hot,
        appointments: 0,
        pending,
        closeRate: toCloseRate(closed, totalLeads),
    };
}

function andAll(conditions: Array<any>) {
    const valid = conditions.filter(Boolean);
    if (valid.length === 0) {
        return undefined;
    }
    if (valid.length === 1) {
        return valid[0];
    }
    return and(...valid);
}

function getRoleLabel(role?: string) {
    switch (role) {
        case "root_admin":
            return "Root Admin";
        case "client_admin":
            return "Client Admin";
        case "supervisor":
            return "Supervisor";
        default:
            return "Sales";
    }
}

function sanitizeGroupName(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim().replace(/\s+/g, " ");
}

function assertCanManageTeamGroups(scope?: QueryScope) {
    if (!scope || (scope.role !== "root_admin" && scope.role !== "client_admin")) {
        throw new Error("FORBIDDEN_TEAM_GROUP");
    }

    if (!scope.clientId) {
        throw new Error("TEAM_GROUP_CLIENT_REQUIRED");
    }
}

function getVisibleMemberCondition(scope?: QueryScope) {
    const baseConditions = [eq(user.isActive, true)];

    if (!scope || scope.role === "root_admin" || scope.role === "client_admin") {
        return andAll(baseConditions);
    }

    if (scope.role === "supervisor") {
        const visibleIds = [scope.userId, ...scope.managedSalesIds];
        return andAll([...baseConditions, inArray(user.id, visibleIds)]);
    }

    return andAll([...baseConditions, eq(user.id, scope.userId)]);
}

function getInactiveSalesCondition(scope?: QueryScope) {
    const baseConditions = [eq(user.role, "sales"), eq(user.isActive, false)];

    if (!scope || scope.role === "root_admin" || scope.role === "client_admin") {
        return andAll(baseConditions);
    }

    return andAll([...baseConditions, eq(user.id, "__none__")]);
}

async function loadScopedMembers(scope?: QueryScope) {
    return db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            clientName: client.name,
            supervisorId: user.supervisorId,
            createdByUserId: user.createdByUserId,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(
            andAll([
                getVisibleMemberCondition(scope),
                inArray(user.role, ["supervisor", "sales"]),
            ])
        )
        .orderBy(asc(client.name), asc(user.role), asc(user.name));
}

async function loadInactiveSalesMembers(scope?: QueryScope) {
    if (scope?.role !== "client_admin" && scope?.role !== "root_admin" && scope) {
        return [];
    }

    return db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            clientName: client.name,
            supervisorId: user.supervisorId,
            createdByUserId: user.createdByUserId,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            deactivatedAt: user.deactivatedAt,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(getInactiveSalesCondition(scope))
        .orderBy(asc(client.name), asc(user.name));
}

async function loadLeadsForSalesIds(
    salesIds: string[],
    clientId?: string | null
) {
    if (salesIds.length === 0) {
        return [];
    }

    const conditions = [inArray(lead.assignedTo, salesIds)];

    if (clientId) {
        conditions.push(eq(lead.clientId, clientId));
    }

    return db
        .select({
            id: lead.id,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
        })
        .from(lead)
        .where(and(...conditions));
}

function buildStatsMap(
    leadRows: Array<{
        assignedTo: string | null;
        flowStatus: string | null;
        salesStatus: string | null;
        resultStatus: string | null;
    }>
) {
    const grouped = new Map<string, Array<{
        flowStatus: string | null;
        salesStatus: string | null;
        resultStatus: string | null;
    }>>();

    for (const row of leadRows) {
        if (!row.assignedTo) {
            continue;
        }

        const current = grouped.get(row.assignedTo) || [];
        current.push({
            flowStatus: row.flowStatus,
            salesStatus: row.salesStatus,
            resultStatus: row.resultStatus,
        });
        grouped.set(row.assignedTo, current);
    }

    const statsMap = new Map<string, ReturnType<typeof createEmptyStats>>();
    for (const [memberId, items] of grouped.entries()) {
        statsMap.set(memberId, buildStatsFromLeads(items));
    }

    return statsMap;
}

function mergeStats(items: ReturnType<typeof createEmptyStats>[]) {
    const totalLeads = items.reduce((sum, item) => sum + item.totalLeads, 0);
    const accepted = items.reduce((sum, item) => sum + item.accepted, 0);
    const closed = items.reduce((sum, item) => sum + item.closed, 0);
    const hot = items.reduce((sum, item) => sum + item.hot, 0);
    const appointments = items.reduce((sum, item) => sum + item.appointments, 0);
    const pending = items.reduce((sum, item) => sum + item.pending, 0);

    return {
        totalLeads,
        accepted,
        closed,
        hot,
        appointments,
        pending,
        closeRate: toCloseRate(closed, totalLeads),
    };
}

function isValidPenaltyStatus(status: string | null | undefined) {
    return status !== "compensated" && status !== "invalid";
}

function getSpRank(spLevel: string | null | undefined) {
    switch (String(spLevel || "").toLowerCase()) {
        case "sp3": return 3;
        case "sp2": return 2;
        case "sp1": return 1;
        default: return 0;
    }
}

async function loadPenaltySummaryMap(salesIds: string[], scope?: QueryScope) {
    const summaryMap = new Map<string, {
        penaltyCount: number;
        spLevel: string;
        latestPenaltySequence: number;
    }>();

    if (salesIds.length === 0) {
        return summaryMap;
    }

    const conditions = [inArray(dailyTaskPenalty.salesId, salesIds)];
    if (scope?.clientId) {
        conditions.push(eq(dailyTaskPenalty.clientId, scope.clientId));
    }

    const rows = await db
        .select({
            salesId: dailyTaskPenalty.salesId,
            penaltySequence: dailyTaskPenalty.penaltySequence,
            spLevel: dailyTaskPenalty.spLevel,
            status: dailyTaskPenalty.status,
        })
        .from(dailyTaskPenalty)
        .where(and(...conditions))
        .orderBy(asc(dailyTaskPenalty.salesId), desc(dailyTaskPenalty.penaltySequence));

    for (const row of rows) {
        if (!isValidPenaltyStatus(row.status)) {
            continue;
        }

        const current = summaryMap.get(row.salesId) || {
            penaltyCount: 0,
            spLevel: "none",
            latestPenaltySequence: 0,
        };
        current.penaltyCount += 1;
        current.latestPenaltySequence = Math.max(current.latestPenaltySequence, Number(row.penaltySequence || 0));
        if (getSpRank(row.spLevel) > getSpRank(current.spLevel)) {
            current.spLevel = row.spLevel || "none";
        }
        summaryMap.set(row.salesId, current);
    }

    return summaryMap;
}

function buildSalesMember(
    member: any,
    statsMap: Map<string, ReturnType<typeof createEmptyStats>>,
    appointmentCountMap: Map<string, number>,
    suspensionMap: Map<string, any>,
    penaltySummaryMap: Map<string, any>
) {
    const stats = statsMap.get(member.id) || createEmptyStats();
    const suspension = suspensionMap.get(member.id) || null;
    const penaltySummary = penaltySummaryMap.get(member.id) || {
        penaltyCount: 0,
        spLevel: "none",
        latestPenaltySequence: 0,
    };

    return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        clientId: member.clientId,
        clientName: member.clientName,
        supervisorId: member.supervisorId,
        isActive: member.isActive,
        deactivatedAt: member.deactivatedAt || null,
        penaltyCount: penaltySummary.penaltyCount || 0,
        penaltySequence: penaltySummary.latestPenaltySequence || 0,
        spLevel: penaltySummary.spLevel || "none",
        isSuspended: Boolean(suspension),
        suspension: suspension
            ? {
                penaltyId: suspension.penaltyId,
                penaltyLayer: suspension.penaltySequence,
                penaltySequence: suspension.penaltySequence,
                durationHours: suspension.durationHours,
                suspendedDays: Math.max(1, Math.ceil(Number(suspension.durationHours || 0) / 24)),
                suspendedFrom: suspension.suspendedFrom,
                suspendedUntil: suspension.suspendedUntil,
                spLevel: suspension.spLevel,
                reason: suspension.reason,
            }
            : null,
        ...stats,
        appointments: appointmentCountMap.get(member.id) || 0,
    };
}

function buildSupervisorMember(
    member: any,
    salesMembers: any[],
    statsMap: Map<string, ReturnType<typeof createEmptyStats>>,
    appointmentCountMap: Map<string, number>,
    suspensionMap: Map<string, any>,
    penaltySummaryMap: Map<string, any>
) {
    const sales = salesMembers
        .map((item) => buildSalesMember(item, statsMap, appointmentCountMap, suspensionMap, penaltySummaryMap))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        clientId: member.clientId,
        clientName: member.clientName,
        salesCount: sales.length,
        suspendedSalesCount: sales.filter((item) => item.isSuspended).length,
        sales,
        ...mergeStats(sales.map((item) => ({
            totalLeads: item.totalLeads,
            accepted: item.accepted,
            closed: item.closed,
            hot: item.hot,
            appointments: item.appointments,
            pending: item.pending,
            closeRate: item.closeRate,
        }))),
    };
}

export async function getTeamHierarchy(scope?: QueryScope) {
    const members = await loadScopedMembers(scope);
    const inactiveSalesMembers = await loadInactiveSalesMembers(scope);
    const salesMembers = members.filter((item) => item.role === "sales");
    const supervisors = members.filter((item) => item.role === "supervisor");
    const salesIds = [...salesMembers, ...inactiveSalesMembers].map((item) => item.id);
    const [leadRows, appointmentCountMap] = await Promise.all([
        loadLeadsForSalesIds(salesIds, scope?.clientId),
        countAppointmentsForSalesIds(salesIds, scope?.clientId),
    ]);
    const salesStatsMap = buildStatsMap(leadRows);
    const [suspensionMap, penaltySummaryMap] = await Promise.all([
        getActiveSalesSuspensionMap(salesIds),
        loadPenaltySummaryMap(salesIds, scope),
    ]);

    const groupMap = new Map<string, {
        id: string;
        clientId: string | null;
        clientName: string;
        supervisors: any[];
        unassignedSales: any[];
        inactiveSales: any[];
    }>();

    const ensureGroup = (clientId: string | null, clientName: string | null) => {
        const key = clientId || "no-client";
        if (!groupMap.has(key)) {
            groupMap.set(key, {
                id: key,
                clientId,
                clientName: clientName || "Tanpa Client",
                supervisors: [],
                unassignedSales: [],
                inactiveSales: [],
            });
        }
        return groupMap.get(key)!;
    };

    if (scope?.role === "supervisor") {
        const supervisor = supervisors[0] || null;
        const group = ensureGroup(supervisor?.clientId || null, supervisor?.clientName || "My Team");

        if (supervisor) {
            group.supervisors.push(
                buildSupervisorMember(
                    supervisor,
                    salesMembers.filter((item) => item.supervisorId === supervisor.id),
                    salesStatsMap,
                    appointmentCountMap,
                    suspensionMap,
                    penaltySummaryMap
                )
            );
        }
    } else {
        for (const supervisor of supervisors) {
            const group = ensureGroup(supervisor.clientId, supervisor.clientName);
            group.supervisors.push(
                buildSupervisorMember(
                    supervisor,
                    salesMembers.filter((item) => item.supervisorId === supervisor.id),
                    salesStatsMap,
                    appointmentCountMap,
                    suspensionMap,
                    penaltySummaryMap
                )
            );
        }

        for (const sales of salesMembers.filter((item) => !item.supervisorId)) {
            const group = ensureGroup(sales.clientId, sales.clientName);
            group.unassignedSales.push(
                buildSalesMember(sales, salesStatsMap, appointmentCountMap, suspensionMap, penaltySummaryMap)
            );
        }

        for (const inactiveSales of inactiveSalesMembers) {
            const group = ensureGroup(inactiveSales.clientId, inactiveSales.clientName);
            group.inactiveSales.push(
                buildSalesMember(inactiveSales, salesStatsMap, appointmentCountMap, suspensionMap, penaltySummaryMap)
            );
        }
    }

    const groups = Array.from(groupMap.values())
        .map((group) => {
            const supervisorStats = group.supervisors.map((item) => ({
                totalLeads: item.totalLeads,
                accepted: item.accepted,
                closed: item.closed,
                hot: item.hot,
                appointments: item.appointments,
                pending: item.pending,
                closeRate: item.closeRate,
            }));
            const unassignedStats = group.unassignedSales.map((item) => ({
                totalLeads: item.totalLeads,
                accepted: item.accepted,
                closed: item.closed,
                hot: item.hot,
                appointments: item.appointments,
                pending: item.pending,
                closeRate: item.closeRate,
            }));

            return {
                ...group,
                supervisors: group.supervisors.sort((a, b) => a.name.localeCompare(b.name)),
                unassignedSales: group.unassignedSales.sort((a, b) => a.name.localeCompare(b.name)),
                inactiveSales: group.inactiveSales.sort((a, b) => a.name.localeCompare(b.name)),
                summary: {
                    supervisors: group.supervisors.length,
                    sales:
                        group.supervisors.reduce((sum, item) => sum + item.salesCount, 0) +
                        group.unassignedSales.length,
                    suspendedSales:
                        group.supervisors.reduce((sum, item) => sum + (item.suspendedSalesCount || 0), 0) +
                        group.unassignedSales.filter((item) => item.isSuspended).length,
                    ...mergeStats([...supervisorStats, ...unassignedStats]),
                },
            };
        })
        .sort((a, b) => a.clientName.localeCompare(b.clientName));

    const supervisorCount = groups.reduce((sum, group) => sum + group.summary.supervisors, 0);
    const salesCount = groups.reduce((sum, group) => sum + group.summary.sales, 0);
    const suspendedSalesCount = groups.reduce((sum, group) => sum + (group.summary.suspendedSales || 0), 0);
    const overallStats = mergeStats(
        groups.map((group) => ({
            totalLeads: group.summary.totalLeads,
            accepted: group.summary.accepted,
            closed: group.summary.closed,
            hot: group.summary.hot,
            appointments: group.summary.appointments,
            pending: group.summary.pending,
            closeRate: group.summary.closeRate,
        }))
    );

    return {
        roleLabel: getRoleLabel(scope?.role),
        summary: {
            supervisors: supervisorCount,
            sales: salesCount,
            suspendedSales: suspendedSalesCount,
            ...overallStats,
        },
        groups,
    };
}

export async function listTeamGroups(scope?: QueryScope) {
    const conditions: any[] = [];

    if (scope?.clientId) {
        conditions.push(eq(teamGroup.clientId, scope.clientId));
    } else if (scope && scope.role !== "root_admin") {
        return [];
    }

    const groupRows = await db
        .select({
            id: teamGroup.id,
            clientId: teamGroup.clientId,
            clientName: client.name,
            name: teamGroup.name,
            createdAt: teamGroup.createdAt,
            updatedAt: teamGroup.updatedAt,
        })
        .from(teamGroup)
        .leftJoin(client, eq(teamGroup.clientId, client.id))
        .where(andAll(conditions))
        .orderBy(asc(client.name), asc(teamGroup.name));

    if (groupRows.length === 0) {
        return [];
    }

    const memberRows = await db
        .select({
            id: teamGroupMember.id,
            groupId: teamGroupMember.groupId,
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
        })
        .from(teamGroupMember)
        .innerJoin(user, eq(teamGroupMember.userId, user.id))
        .where(inArray(teamGroupMember.groupId, groupRows.map((row) => row.id)))
        .orderBy(asc(user.role), asc(user.name));

    const membersByGroup = new Map<string, typeof memberRows>();
    for (const row of memberRows) {
        const current = membersByGroup.get(row.groupId) || [];
        current.push(row);
        membersByGroup.set(row.groupId, current);
    }

    return groupRows.map((row) => ({
        ...row,
        members: (membersByGroup.get(row.id) || []).map((member) => ({
            id: member.id,
            userId: member.userId,
            name: member.name,
            email: member.email,
            role: member.role,
            clientId: member.clientId,
            supervisorId: member.supervisorId,
            isActive: member.isActive,
        })),
    }));
}

export async function createTeamGroup(params: {
    name: unknown;
    actorId: string;
    scope?: QueryScope;
}) {
    assertCanManageTeamGroups(params.scope);
    const name = sanitizeGroupName(params.name);
    if (!name) {
        throw new Error("TEAM_GROUP_NAME_REQUIRED");
    }

    const now = new Date();
    const [created] = await db
        .insert(teamGroup)
        .values({
            id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            clientId: params.scope!.clientId!,
            name,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

async function loadScopedTeamGroup(groupId: string, scope?: QueryScope) {
    const conditions = [eq(teamGroup.id, groupId)];
    if (scope?.clientId) {
        conditions.push(eq(teamGroup.clientId, scope.clientId));
    } else if (scope && scope.role !== "root_admin") {
        conditions.push(eq(teamGroup.id, "__none__"));
    }

    const [row] = await db
        .select()
        .from(teamGroup)
        .where(and(...conditions))
        .limit(1);

    return row || null;
}

export async function deleteTeamGroup(params: {
    groupId: string;
    scope?: QueryScope;
}) {
    assertCanManageTeamGroups(params.scope);
    const existing = await loadScopedTeamGroup(params.groupId, params.scope);
    if (!existing) {
        throw new Error("TEAM_GROUP_NOT_FOUND");
    }

    const [deleted] = await db
        .delete(teamGroup)
        .where(eq(teamGroup.id, existing.id))
        .returning();

    return deleted;
}

export async function addTeamGroupMember(params: {
    groupId: string;
    userId: string;
    scope?: QueryScope;
}) {
    assertCanManageTeamGroups(params.scope);
    const existing = await loadScopedTeamGroup(params.groupId, params.scope);
    if (!existing) {
        throw new Error("TEAM_GROUP_NOT_FOUND");
    }

    const [member] = await db
        .select({
            id: user.id,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, params.userId))
        .limit(1);

    if (
        !member ||
        !member.isActive ||
        (member.role !== "supervisor" && member.role !== "sales") ||
        member.clientId !== existing.clientId
    ) {
        throw new Error("TEAM_GROUP_INVALID_MEMBER");
    }

    const [created] = await db
        .insert(teamGroupMember)
        .values({
            id: `tgm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            groupId: existing.id,
            userId: params.userId,
        })
        .onConflictDoNothing()
        .returning();

    return created || { groupId: existing.id, userId: params.userId };
}

export async function removeTeamGroupMember(params: {
    groupId: string;
    memberId: string;
    scope?: QueryScope;
}) {
    assertCanManageTeamGroups(params.scope);
    const existing = await loadScopedTeamGroup(params.groupId, params.scope);
    if (!existing) {
        throw new Error("TEAM_GROUP_NOT_FOUND");
    }

    const [deleted] = await db
        .delete(teamGroupMember)
        .where(and(eq(teamGroupMember.groupId, existing.id), eq(teamGroupMember.id, params.memberId)))
        .returning();

    if (!deleted) {
        throw new Error("TEAM_GROUP_MEMBER_NOT_FOUND");
    }

    return deleted;
}

function assertCanManageSalesPenalty(scope?: QueryScope) {
    if (!scope || (scope.role !== "root_admin" && scope.role !== "client_admin")) {
        throw new Error("FORBIDDEN_PENALTY_MANAGEMENT");
    }
}

async function loadVisibleSalesForPenaltyAction(salesId: string, scope?: QueryScope) {
    const member = await loadVisibleMemberById(salesId, scope);
    if (!member || member.role !== "sales") {
        throw new Error("TEAM_MEMBER_NOT_FOUND");
    }
    return member;
}

async function insertSalesPenaltyActivity(
    executor: any,
    params: {
        salesId: string;
        clientId?: string | null;
        note: string;
        timestamp: Date;
    }
) {
    const leadConditions = [eq(lead.assignedTo, params.salesId)];
    if (params.clientId) {
        leadConditions.push(eq(lead.clientId, params.clientId));
    }

    const [latestLead] = await executor
        .select({ id: lead.id })
        .from(lead)
        .where(and(...leadConditions))
        .orderBy(desc(lead.updatedAt), desc(lead.createdAt))
        .limit(1);

    if (!latestLead) {
        return;
    }

    await executor.insert(activity).values({
        id: generateId(),
        leadId: latestLead.id,
        type: "penalty",
        note: params.note,
        timestamp: params.timestamp,
    });
}

export async function resetSalesPenalties(params: {
    salesId: string;
    actorId: string;
    scope?: QueryScope;
}) {
    assertCanManageSalesPenalty(params.scope);
    const sales = await loadVisibleSalesForPenaltyAction(params.salesId, params.scope);
    const now = new Date();

    return db.transaction(async (tx) => {
        const conditions = [eq(dailyTaskPenalty.salesId, sales.id)];
        if (params.scope?.clientId) {
            conditions.push(eq(dailyTaskPenalty.clientId, params.scope.clientId));
        }

        const penaltyRows = await tx
            .select({
                id: dailyTaskPenalty.id,
                status: dailyTaskPenalty.status,
            })
            .from(dailyTaskPenalty)
            .where(and(...conditions));

        const validPenaltyIds = penaltyRows
            .filter((row) => isValidPenaltyStatus(row.status))
            .map((row) => row.id);

        if (validPenaltyIds.length === 0) {
            return { salesId: sales.id, updatedCount: 0 };
        }

        await tx
            .update(dailyTaskPenalty)
            .set({
                status: "invalid",
                compensationReason: `Penalty direset oleh admin ${params.actorId}`,
                updatedAt: now,
            })
            .where(inArray(dailyTaskPenalty.id, validPenaltyIds));

        await tx
            .update(dailyTaskPenaltySuspension)
            .set({
                status: "invalid",
                updatedAt: now,
            })
            .where(inArray(dailyTaskPenaltySuspension.penaltyId, validPenaltyIds));

        await insertSalesPenaltyActivity(tx, {
            salesId: sales.id,
            clientId: sales.clientId,
            note: `Penalty ${sales.name} direset oleh admin. ${validPenaltyIds.length} penalty ditandai invalid.`,
            timestamp: now,
        });

        return { salesId: sales.id, updatedCount: validPenaltyIds.length };
    });
}

export async function resetSalesSpLevel(params: {
    salesId: string;
    actorId: string;
    scope?: QueryScope;
}) {
    assertCanManageSalesPenalty(params.scope);
    const sales = await loadVisibleSalesForPenaltyAction(params.salesId, params.scope);
    const now = new Date();

    return db.transaction(async (tx) => {
        const conditions = [eq(dailyTaskPenalty.salesId, sales.id)];
        if (params.scope?.clientId) {
            conditions.push(eq(dailyTaskPenalty.clientId, params.scope.clientId));
        }

        const penaltyRows = await tx
            .select({
                id: dailyTaskPenalty.id,
                status: dailyTaskPenalty.status,
                spLevel: dailyTaskPenalty.spLevel,
            })
            .from(dailyTaskPenalty)
            .where(and(...conditions));

        const targetPenaltyIds = penaltyRows
            .filter((row) => isValidPenaltyStatus(row.status) && getSpRank(row.spLevel) > 0)
            .map((row) => row.id);

        if (targetPenaltyIds.length === 0) {
            return { salesId: sales.id, updatedCount: 0 };
        }

        await tx
            .update(dailyTaskPenalty)
            .set({
                spLevel: "none",
                updatedAt: now,
            })
            .where(inArray(dailyTaskPenalty.id, targetPenaltyIds));

        await insertSalesPenaltyActivity(tx, {
            salesId: sales.id,
            clientId: sales.clientId,
            note: `SP ${sales.name} direset oleh admin. ${targetPenaltyIds.length} penalty dikembalikan ke SP none.`,
            timestamp: now,
        });

        return { salesId: sales.id, updatedCount: targetPenaltyIds.length };
    });
}

async function loadVisibleMemberById(memberId: string, scope?: QueryScope) {
    const [member] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            clientName: client.name,
            supervisorId: user.supervisorId,
            createdByUserId: user.createdByUserId,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(
            andAll([
                getVisibleMemberCondition(scope),
                eq(user.id, memberId),
            ])
        )
        .limit(1);

    if (!member) {
        return null;
    }

    const extraUserIds = [
        member.supervisorId,
        member.createdByUserId,
    ].filter((value): value is string => Boolean(value));

    const relatedUsers = extraUserIds.length > 0
        ? await db
            .select({
                id: user.id,
                name: user.name,
            })
            .from(user)
            .where(inArray(user.id, extraUserIds))
        : [];

    const relatedUserMap = new Map(relatedUsers.map((item) => [item.id, item.name]));

    return {
        ...member,
        supervisorName: member.supervisorId ? relatedUserMap.get(member.supervisorId) || null : null,
        createdByName: member.createdByUserId ? relatedUserMap.get(member.createdByUserId) || null : null,
    };
}

async function loadManagedSales(supervisorId: string) {
    return db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            clientId: user.clientId,
            clientName: client.name,
            supervisorId: user.supervisorId,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(
            and(
                eq(user.role, "sales"),
                eq(user.supervisorId, supervisorId),
                eq(user.isActive, true)
            )
        )
        .orderBy(asc(user.name));
}

async function loadMemberLeadDetails(
    member: any,
    managedSalesIds: string[],
    scope?: QueryScope
) {
    const workspaceConditions = scope?.clientId ? [eq(lead.clientId, scope.clientId)] : [];

    if (member.role === "sales") {
        return db
            .select({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                flowStatus: lead.flowStatus,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
                assignedTo: lead.assignedTo,
                assignedUserName: user.name,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
            })
            .from(lead)
            .leftJoin(user, eq(lead.assignedTo, user.id))
            .where(and(eq(lead.assignedTo, member.id), ...workspaceConditions))
            .orderBy(desc(lead.createdAt));
    }

    if (member.role === "supervisor") {
        if (managedSalesIds.length === 0) {
            return [];
        }

        return db
            .select({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                flowStatus: lead.flowStatus,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
                assignedTo: lead.assignedTo,
                assignedUserName: user.name,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
            })
            .from(lead)
            .leftJoin(user, eq(lead.assignedTo, user.id))
            .where(and(inArray(lead.assignedTo, managedSalesIds), ...workspaceConditions))
            .orderBy(desc(lead.createdAt));
    }

    if (member.role === "client_admin" && scope?.clientId) {
        return db
            .select({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                flowStatus: lead.flowStatus,
                salesStatus: lead.salesStatus,
                resultStatus: lead.resultStatus,
                assignedTo: lead.assignedTo,
                assignedUserName: user.name,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
            })
            .from(lead)
            .leftJoin(user, eq(lead.assignedTo, user.id))
            .where(eq(lead.clientId, scope.clientId))
            .orderBy(desc(lead.createdAt));
    }

    return [];
}

export async function getTeamMemberDetail(memberId: string, scope?: QueryScope) {
    const member = await loadVisibleMemberById(memberId, scope);
    if (!member) {
        return null;
    }

    const managedSales =
        member.role === "supervisor" ? await loadManagedSales(member.id) : [];
    const managedSalesIds = managedSales.map((item) => item.id);
    const leadRows = await loadMemberLeadDetails(member, managedSalesIds, scope);
    const appointmentCountMap = await countAppointmentsForSalesIds(
        member.role === "sales" ? [member.id] : managedSalesIds,
        scope?.clientId
    );
    const suspensionMap = await getActiveSalesSuspensionMap(
        member.role === "sales" ? [member.id] : managedSalesIds
    );
    const penaltySummaryMap = await loadPenaltySummaryMap(
        member.role === "sales" ? [member.id] : managedSalesIds,
        scope
    );
    const memberSuspension = member.role === "sales" ? (suspensionMap.get(member.id) || null) : null;
    const memberPenaltySummary = penaltySummaryMap.get(member.id) || {
        penaltyCount: 0,
        latestPenaltySequence: 0,
        spLevel: "none",
    };
    const salesStatsMap = buildStatsMap(
        leadRows.map((item) => ({
            assignedTo: item.assignedTo,
            flowStatus: item.flowStatus,
            salesStatus: item.salesStatus,
            resultStatus: item.resultStatus,
        }))
    );

    const memberStats =
        member.role === "supervisor"
            ? mergeStats(
                managedSales.map((item) => ({
                    ...(salesStatsMap.get(item.id) || createEmptyStats()),
                    appointments: appointmentCountMap.get(item.id) || 0,
                }))
            )
            : {
                ...buildStatsFromLeads(
                    leadRows.map((item) => ({
                        flowStatus: item.flowStatus,
                        salesStatus: item.salesStatus,
                        resultStatus: item.resultStatus,
                    }))
                ),
                appointments: appointmentCountMap.get(member.id) || 0,
            };

    return {
        member: {
            id: member.id,
            name: member.name,
            email: member.email,
            phone: member.phone,
            role: member.role,
            roleLabel: getRoleLabel(member.role),
            clientId: member.clientId,
            clientName: member.clientName,
            supervisorId: member.supervisorId,
            supervisorName: member.supervisorName,
            createdByUserId: member.createdByUserId,
            createdByName: member.createdByName,
            isActive: member.isActive,
            penaltyCount: member.role === "sales" ? memberPenaltySummary.penaltyCount || 0 : 0,
            penaltySequence: member.role === "sales" ? memberPenaltySummary.latestPenaltySequence || 0 : 0,
            spLevel: member.role === "sales" ? memberPenaltySummary.spLevel || "none" : "none",
            isSuspended: Boolean(memberSuspension),
            suspension: memberSuspension
                ? {
                    penaltyId: memberSuspension.penaltyId,
                    penaltyLayer: memberSuspension.penaltySequence,
                    penaltySequence: memberSuspension.penaltySequence,
                    durationHours: memberSuspension.durationHours,
                    suspendedDays: Math.max(1, Math.ceil(Number(memberSuspension.durationHours || 0) / 24)),
                    suspendedFrom: memberSuspension.suspendedFrom,
                    suspendedUntil: memberSuspension.suspendedUntil,
                    spLevel: memberSuspension.spLevel,
                    reason: memberSuspension.reason,
                }
                : null,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt,
            managedSalesCount: managedSales.length,
            ...memberStats,
        },
        managedSales: managedSales.map((item) => {
            const itemSuspension = suspensionMap.get(item.id) || null;
            const itemPenaltySummary = penaltySummaryMap.get(item.id) || {
                penaltyCount: 0,
                latestPenaltySequence: 0,
                spLevel: "none",
            };
            return {
                id: item.id,
                name: item.name,
                email: item.email,
                phone: item.phone,
                role: item.role,
                supervisorId: item.supervisorId,
                penaltyCount: itemPenaltySummary.penaltyCount || 0,
                penaltySequence: itemPenaltySummary.latestPenaltySequence || 0,
                spLevel: itemPenaltySummary.spLevel || "none",
                isSuspended: Boolean(itemSuspension),
                suspension: itemSuspension
                    ? {
                        penaltyId: itemSuspension.penaltyId,
                        penaltyLayer: itemSuspension.penaltySequence,
                        penaltySequence: itemSuspension.penaltySequence,
                        durationHours: itemSuspension.durationHours,
                        suspendedDays: Math.max(1, Math.ceil(Number(itemSuspension.durationHours || 0) / 24)),
                        suspendedFrom: itemSuspension.suspendedFrom,
                        suspendedUntil: itemSuspension.suspendedUntil,
                        spLevel: itemSuspension.spLevel,
                        reason: itemSuspension.reason,
                    }
                    : null,
                ...((salesStatsMap.get(item.id) || createEmptyStats())),
                appointments: appointmentCountMap.get(item.id) || 0,
            };
        }),
        leads: leadRows,
    };
}

export async function deactivateSupervisorMember(params: {
    supervisorId: string;
    actorId: string;
    scope?: QueryScope;
}) {
    const member = await loadVisibleMemberById(params.supervisorId, params.scope);

    if (!member) {
        throw new Error("TEAM_MEMBER_NOT_FOUND");
    }

    if (member.role !== "supervisor") {
        throw new Error("INVALID_SUPERVISOR");
    }

    if (
        params.scope?.role === "client_admin" &&
        params.scope.clientId &&
        member.clientId !== params.scope.clientId
    ) {
        throw new Error("TEAM_MEMBER_NOT_FOUND");
    }

    const [activeSalesRow] = await db
        .select({
            id: user.id,
        })
        .from(user)
        .where(
            and(
                eq(user.role, "sales"),
                eq(user.supervisorId, member.id),
                eq(user.isActive, true)
            )
        )
        .limit(1);

    if (activeSalesRow) {
        throw new Error("SUPERVISOR_HAS_ACTIVE_SALES");
    }

    return db.transaction(async (tx) => {
        await tx.delete(session).where(eq(session.userId, member.id));

        const [updated] = await tx
            .update(user)
            .set({
                isActive: false,
                deactivatedAt: new Date(),
                deactivatedByUserId: params.actorId,
                reactivatedAt: null,
                reactivatedByUserId: null,
                updatedAt: new Date(),
            })
            .where(eq(user.id, member.id))
            .returning({
                id: user.id,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
            });

        if (!updated) {
            throw new Error("TEAM_MEMBER_NOT_FOUND");
        }

        return updated;
    });
}

export async function deleteInactiveSalesMember(params: {
    salesId: string;
    actorId: string;
    scope?: QueryScope;
}) {
    if (!params.scope || (params.scope.role !== "root_admin" && params.scope.role !== "client_admin")) {
        throw new Error("FORBIDDEN_SALES_DELETE");
    }

    const conditions = [
        eq(user.id, params.salesId),
        eq(user.role, "sales"),
        eq(user.isActive, false),
    ];

    if (params.scope.role !== "root_admin" && params.scope.clientId) {
        conditions.push(eq(user.clientId, params.scope.clientId));
    }

    const [member] = await db
        .select({
            id: user.id,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
        })
        .from(user)
        .where(and(...conditions))
        .limit(1);

    if (!member) {
        throw new Error("INACTIVE_SALES_NOT_FOUND");
    }

    return db.transaction(async (tx) => {
        await tx.delete(session).where(eq(session.userId, member.id));
        await tx.delete(teamGroupMember).where(eq(teamGroupMember.userId, member.id));

        const [deleted] = await tx
            .delete(user)
            .where(eq(user.id, member.id))
            .returning({
                id: user.id,
                name: user.name,
                role: user.role,
            });

        return deleted;
    });
}
