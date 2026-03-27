import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { client, lead, user } from "../db/schema";
import type { QueryScope } from "../middleware/rbac";
import { countAppointmentsForSalesIds } from "./appointments.service";
import { getActiveSalesSuspensionMap } from "./sales-suspension.service";

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
        (item) => item.resultStatus === "akad" || item.resultStatus === "full_book"
    ).length;
    const hot = items.filter((item) => item.salesStatus === "hot").length;
    const pending = items.filter(
        (item) =>
            item.flowStatus === "open" ||
            item.resultStatus === "reserve" ||
            item.resultStatus === "on_process" ||
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

function getVisibleMemberCondition(scope?: QueryScope) {
    const baseConditions = [eq(user.isActive, true)];

    if (!scope || scope.role === "root_admin") {
        return andAll(baseConditions);
    }

    if (scope.role === "client_admin" && scope.clientId) {
        return andAll([...baseConditions, eq(user.clientId, scope.clientId)]);
    }

    if (scope.role === "supervisor") {
        const visibleIds = [scope.userId, ...scope.managedSalesIds];
        return andAll([...baseConditions, inArray(user.id, visibleIds)]);
    }

    return andAll([...baseConditions, eq(user.id, scope.userId)]);
}

function getInactiveSalesCondition(scope?: QueryScope) {
    const baseConditions = [eq(user.role, "sales"), eq(user.isActive, false)];

    if (!scope || scope.role === "root_admin") {
        return andAll(baseConditions);
    }

    if (scope.role === "client_admin" && scope.clientId) {
        return andAll([...baseConditions, eq(user.clientId, scope.clientId)]);
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

async function loadLeadsForSalesIds(salesIds: string[]) {
    if (salesIds.length === 0) {
        return [];
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
        .where(inArray(lead.assignedTo, salesIds));
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

function buildSalesMember(
    member: any,
    statsMap: Map<string, ReturnType<typeof createEmptyStats>>,
    appointmentCountMap: Map<string, number>,
    suspensionMap: Map<string, any>
) {
    const stats = statsMap.get(member.id) || createEmptyStats();
    const suspension = suspensionMap.get(member.id) || null;

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
        isSuspended: Boolean(suspension),
        suspension: suspension
            ? {
                penaltyLayer: suspension.penaltyLayer,
                suspendedDays: suspension.suspendedDays,
                suspendedFrom: suspension.suspendedFrom,
                suspendedUntil: suspension.suspendedUntil,
                ruleCode: suspension.ruleCode,
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
    suspensionMap: Map<string, any>
) {
    const sales = salesMembers
        .map((item) => buildSalesMember(item, statsMap, appointmentCountMap, suspensionMap))
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
        loadLeadsForSalesIds(salesIds),
        countAppointmentsForSalesIds(salesIds),
    ]);
    const salesStatsMap = buildStatsMap(leadRows);
    const suspensionMap = await getActiveSalesSuspensionMap(salesIds);

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
                    suspensionMap
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
                    suspensionMap
                )
            );
        }

        for (const sales of salesMembers.filter((item) => !item.supervisorId)) {
            const group = ensureGroup(sales.clientId, sales.clientName);
            group.unassignedSales.push(
                buildSalesMember(sales, salesStatsMap, appointmentCountMap, suspensionMap)
            );
        }

        for (const inactiveSales of inactiveSalesMembers) {
            const group = ensureGroup(inactiveSales.clientId, inactiveSales.clientName);
            group.inactiveSales.push(
                buildSalesMember(inactiveSales, salesStatsMap, appointmentCountMap, suspensionMap)
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

async function loadMemberLeadDetails(member: any, managedSalesIds: string[]) {
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
            .where(eq(lead.assignedTo, member.id))
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
            .where(inArray(lead.assignedTo, managedSalesIds))
            .orderBy(desc(lead.createdAt));
    }

    if (member.role === "client_admin" && member.clientId) {
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
            .where(eq(lead.clientId, member.clientId))
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
    const leadRows = await loadMemberLeadDetails(member, managedSalesIds);
    const appointmentCountMap = await countAppointmentsForSalesIds(
        member.role === "sales" ? [member.id] : managedSalesIds
    );
    const suspensionMap = await getActiveSalesSuspensionMap(
        member.role === "sales" ? [member.id] : managedSalesIds
    );
    const memberSuspension = member.role === "sales" ? (suspensionMap.get(member.id) || null) : null;
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
            isSuspended: Boolean(memberSuspension),
            suspension: memberSuspension
                ? {
                    penaltyLayer: memberSuspension.penaltyLayer,
                    suspendedDays: memberSuspension.suspendedDays,
                    suspendedFrom: memberSuspension.suspendedFrom,
                    suspendedUntil: memberSuspension.suspendedUntil,
                    ruleCode: memberSuspension.ruleCode,
                }
                : null,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt,
            managedSalesCount: managedSales.length,
            ...memberStats,
        },
        managedSales: managedSales.map((item) => {
            const itemSuspension = suspensionMap.get(item.id) || null;
            return {
                id: item.id,
                name: item.name,
                email: item.email,
                phone: item.phone,
                role: item.role,
                supervisorId: item.supervisorId,
                isSuspended: Boolean(itemSuspension),
                suspension: itemSuspension
                    ? {
                        penaltyLayer: itemSuspension.penaltyLayer,
                        suspendedDays: itemSuspension.suspendedDays,
                        suspendedFrom: itemSuspension.suspendedFrom,
                        suspendedUntil: itemSuspension.suspendedUntil,
                        ruleCode: itemSuspension.ruleCode,
                    }
                    : null,
                ...((salesStatsMap.get(item.id) || createEmptyStats())),
                appointments: appointmentCountMap.get(item.id) || 0,
            };
        }),
        leads: leadRows,
    };
}
