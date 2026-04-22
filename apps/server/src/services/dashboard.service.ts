import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/index";
import { appointment, cancelReason, client, lead, user } from "../db/schema";
import { resolveAppointmentTag, toAppointmentDateTime } from "../utils/appointment";
import type { QueryScope } from "../middleware/rbac";

type LeadRow = {
    id: string;
    name: string;
    phone: string;
    clientId: string | null;
    source: string;
    assignedTo: string | null;
    assignedUserName: string | null;
    assignedUserEmail: string | null;
    supervisorId: string | null;
    flowStatus: string;
    salesStatus: string | null;
    domicileCity: string | null;
    interestProjectType: string | null;
    interestUnitName: string | null;
    resultStatus: string | null;
    unitName: string | null;
    rejectedReason: string | null;
    validated: boolean;
    progress: string;
    createdAt: Date;
    updatedAt: Date;
};

type AppointmentRow = {
    id: string;
    leadId: string;
    date: string;
    time: string;
    status: string;
    location: string;
    notes: string | null;
    salesId: string | null;
    salesName: string | null;
    createdAt: Date;
    updatedAt: Date;
    leadName: string;
    leadPhone: string;
    assignedTo: string | null;
};

type DashboardDateRange = {
    dateFrom?: string;
    dateTo?: string;
};

const SALES_STATUS_META = [
    { key: "hot", label: "Hot" },
    { key: "warm", label: "Warm" },
    { key: "cold", label: "Cold" },
    { key: "error", label: "Error" },
    { key: "no_response", label: "No Response" },
    { key: "skip", label: "Skip" },
] as const;

const RESULT_STATUS_META = [
    { key: "reserve", label: "Reserve" },
    { key: "on_process", label: "On Process" },
    { key: "full_book", label: "Full Book" },
    { key: "akad", label: "Akad" },
    { key: "cancel", label: "Cancel" },
] as const;

const TRANSACTION_STATUS_META = [
    { key: "all", label: "Semua" },
    { key: "akad", label: "Akad" },
    { key: "full_book", label: "Full Book" },
    { key: "on_process", label: "On Process" },
    { key: "reserve", label: "Reserve" },
    { key: "cancel", label: "Cancel" },
] as const;

const DATABASE_STATUS_LAYER_META = {
    l1: [
        { key: "open", label: "Open" },
        { key: "hold", label: "Hold" },
        { key: "assigned", label: "Assigned" },
        { key: "accepted", label: "Accepted" },
    ],
    l2: [
        { key: "hot", label: "Hot" },
        { key: "hot_validated", label: "Hot Validated" },
        { key: "warm", label: "Warm" },
        { key: "cold", label: "Cold" },
        { key: "no_response", label: "No Response" },
        { key: "error", label: "Error" },
        { key: "skip", label: "Skip" },
        { key: "unfilled", label: "Belum Diisi" },
    ],
    l3: [
        { key: "sudah_survey", label: "Survey" },
        { key: "mau_survey", label: "Mau Survey" },
        { key: "dibatalkan", label: "Dibatalkan" },
        { key: "none", label: "Belum Ada Appointment" },
    ],
    l4: [
        { key: "akad", label: "Akad" },
        { key: "full_book", label: "Full Book" },
        { key: "on_process", label: "On Process" },
        { key: "reserve", label: "Reserve" },
        { key: "cancel", label: "Cancel" },
        { key: "none", label: "Belum Masuk Transaksi" },
    ],
} as const;

const DATABASE_STATUS_LAYER_OPTIONS = [
    { key: "l1", label: "L1" },
    { key: "l2", label: "L2" },
    { key: "l3", label: "L3" },
    { key: "l4", label: "L4" },
] as const;

const PIC_AGENT_EMAIL = "picagent@gmail.com";
const LINE_CHART_TOP_SOURCE_LIMIT = 5;
const LINE_CHART_GRANULARITY_OPTIONS = [
    { key: "day", label: "Hari" },
    { key: "week", label: "Minggu" },
    { key: "month", label: "Bulan" },
    { key: "year", label: "Tahun" },
] as const;
const LINE_CHART_DATASET_OPTIONS = [
    { key: "source", label: "Data Sumber" },
    { key: "l3", label: "Status L3" },
    { key: "l4", label: "Status L4" },
] as const;
const LINE_CHART_L3_SERIES = [
    { key: "sudah_survey", label: "Survey" },
    { key: "mau_survey", label: "Mau Survey" },
] as const;
const LINE_CHART_L4_SERIES = [
    { key: "akad", label: "Akad" },
    { key: "full_book", label: "Full Book" },
    { key: "reserve", label: "Reserve" },
    { key: "on_process", label: "Process" },
    { key: "cancel", label: "Cancel" },
] as const;

function toLowerTrimmed(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase();
}

function humanizeKey(value: string | null | undefined) {
    return String(value || "Lainnya")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveTransactionStatusKey(resultStatus: string | null | undefined) {
    const normalized = toLowerTrimmed(resultStatus);
    if (
        normalized === "akad" ||
        normalized === "full_book" ||
        normalized === "on_process" ||
        normalized === "reserve" ||
        normalized === "cancel"
    ) {
        return normalized;
    }
    return null;
}

function resolveTransactionUnitType(item: Pick<
    LeadRow,
    "interestProjectType" | "interestUnitName" | "unitName"
>) {
    return (
        item.interestProjectType ||
        item.interestUnitName ||
        item.unitName ||
        "Belum Diisi"
    );
}

function normalizeFlowStatus(
    flowStatus: string | null | undefined,
    assignedTo: string | null | undefined
) {
    if (flowStatus === "hold") return "hold";
    if (flowStatus === "accepted") return "accepted";
    if (flowStatus === "assigned") return "assigned";
    if (assignedTo) return "assigned";
    return "open";
}

function toPercent(count: number, total: number) {
    if (total <= 0) return 0;
    return Math.round((count / total) * 10000) / 100;
}

function createStatusCountMap(items: ReadonlyArray<{ key: string }>) {
    return new Map(items.map((item) => [item.key, 0]));
}

function createDatabaseStatusScopeBucket() {
    return {
        totalData: 0,
        layers: {
            l1: createStatusCountMap(DATABASE_STATUS_LAYER_META.l1),
            l2: createStatusCountMap(DATABASE_STATUS_LAYER_META.l2),
            l3: createStatusCountMap(DATABASE_STATUS_LAYER_META.l3),
            l4: createStatusCountMap(DATABASE_STATUS_LAYER_META.l4),
        },
    };
}

function incrementStatusCount(
    bucket: ReturnType<typeof createDatabaseStatusScopeBucket>,
    layerKey: keyof typeof DATABASE_STATUS_LAYER_META,
    rawStatus: string | null | undefined,
    fallbackKey: string
) {
    const layerMap = bucket.layers[layerKey];
    const normalizedStatus = String(rawStatus || "").trim().toLowerCase();
    const nextKey = layerMap.has(normalizedStatus) ? normalizedStatus : fallbackKey;
    layerMap.set(nextKey, (layerMap.get(nextKey) || 0) + 1);
}

function startOfWeek(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const offset = (next.getDay() + 6) % 7;
    next.setDate(next.getDate() - offset);
    return next;
}

function toPeriodStart(date: Date, granularity: string) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);

    if (granularity === "year") {
        return new Date(next.getFullYear(), 0, 1);
    }

    if (granularity === "month") {
        return new Date(next.getFullYear(), next.getMonth(), 1);
    }

    if (granularity === "week") {
        return startOfWeek(next);
    }

    return next;
}

function addPeriod(date: Date, granularity: string) {
    if (granularity === "year") {
        return new Date(date.getFullYear() + 1, 0, 1);
    }

    if (granularity === "month") {
        return new Date(date.getFullYear(), date.getMonth() + 1, 1);
    }

    if (granularity === "week") {
        const next = new Date(date);
        next.setDate(next.getDate() + 7);
        return next;
    }

    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return next;
}

function formatPeriodKey(date: Date) {
    return date.toISOString();
}

function formatLineChartPeriodLabel(date: Date, granularity: string) {
    if (granularity === "year") {
        return new Intl.DateTimeFormat("id-ID", {
            year: "numeric",
        }).format(date);
    }

    if (granularity === "month") {
        return new Intl.DateTimeFormat("id-ID", {
            month: "short",
            year: "numeric",
        }).format(date);
    }

    if (granularity === "week") {
        const end = new Date(date);
        end.setDate(end.getDate() + 6);
        return `${new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "short",
        }).format(date)} - ${new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "short",
        }).format(end)}`;
    }

    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
    }).format(date);
}

function buildLineChartPeriods(dates: Date[], granularity: string) {
    const validDates = dates.filter((date) => !Number.isNaN(date.getTime()));
    if (validDates.length === 0) {
        return [];
    }

    let cursor = toPeriodStart(validDates[0], granularity);
    let max = cursor;

    for (const date of validDates) {
        const periodStart = toPeriodStart(date, granularity);
        if (periodStart.getTime() < cursor.getTime()) {
            cursor = periodStart;
        }
        if (periodStart.getTime() > max.getTime()) {
            max = periodStart;
        }
    }

    const periods: Array<{ key: string; label: string; startAt: Date }> = [];
    let nextCursor = new Date(cursor);
    while (nextCursor.getTime() <= max.getTime()) {
        periods.push({
            key: formatPeriodKey(nextCursor),
            label: formatLineChartPeriodLabel(nextCursor, granularity),
            startAt: new Date(nextCursor),
        });
        nextCursor = addPeriod(nextCursor, granularity);
    }

    return periods;
}

function buildLineChartSeriesBucket(
    periods: Array<{ key: string; label: string }>,
    seriesEntries: Array<{ key: string; label: string }>
) {
    const rows = periods.map((period) => ({
        key: period.key,
        label: period.label,
        values: Object.fromEntries(seriesEntries.map((series) => [series.key, 0])),
    }));

    return {
        rows,
        rowMap: new Map(rows.map((row) => [row.key, row])),
        totals: new Map(seriesEntries.map((series) => [series.key, 0])),
    };
}

function toDateStart(dateValue?: string) {
    if (!dateValue) {
        return null;
    }

    const dt = new Date(`${dateValue}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateEnd(dateValue?: string) {
    if (!dateValue) {
        return null;
    }

    const dt = new Date(`${dateValue}T23:59:59.999`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeDateRange(filters?: DashboardDateRange) {
    const start = toDateStart(filters?.dateFrom);
    const end = toDateEnd(filters?.dateTo);

    if (start && end && start.getTime() > end.getTime()) {
        return {
            dateFrom: end,
            dateTo: start,
        };
    }

    return {
        dateFrom: start,
        dateTo: end,
    };
}

function getLatestAppointmentByLead(appointments: AppointmentRow[]) {
    const latestMap = new Map<string, AppointmentRow>();

    for (const item of appointments) {
        const prev = latestMap.get(item.leadId);
        if (!prev) {
            latestMap.set(item.leadId, item);
            continue;
        }

        const prevAt = toAppointmentDateTime(prev.date, prev.time).getTime();
        const nextAt = toAppointmentDateTime(item.date, item.time).getTime();
        if (nextAt > prevAt) {
            latestMap.set(item.leadId, item);
        }
    }

    return latestMap;
}

async function loadScopedLeadsAndAppointments(
    userId: string,
    role: string,
    scope?: QueryScope,
    filters?: DashboardDateRange
) {
    const conditions: any[] = [];

    if (role === "root_admin") {
        // no filter
    } else if (role === "client_admin" && scope?.clientId) {
        conditions.push(eq(lead.clientId, scope.clientId));
    } else if (role === "supervisor" && scope?.managedSalesIds && scope.managedSalesIds.length > 0) {
        conditions.push(inArray(lead.assignedTo, scope.managedSalesIds));
    } else {
        conditions.push(eq(lead.assignedTo, userId));
    }

    const normalizedDateRange = normalizeDateRange(filters);
    if (normalizedDateRange.dateFrom) {
        conditions.push(gte(lead.receivedAt, normalizedDateRange.dateFrom));
    }
    if (normalizedDateRange.dateTo) {
        conditions.push(lte(lead.receivedAt, normalizedDateRange.dateTo));
    }

    const leadCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const scopedLeads = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            clientId: lead.clientId,
            source: lead.source,
            assignedTo: lead.assignedTo,
            assignedUserName: user.name,
            assignedUserEmail: user.email,
            supervisorId: user.supervisorId,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            domicileCity: lead.domicileCity,
            interestProjectType: lead.interestProjectType,
            interestUnitName: lead.interestUnitName,
            resultStatus: lead.resultStatus,
            unitName: lead.unitName,
            rejectedReason: lead.rejectedReason,
            validated: lead.validated,
            progress: lead.progress,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(leadCondition);

    if (scopedLeads.length === 0) {
        return {
            leads: [] as LeadRow[],
            appointments: [] as AppointmentRow[],
        };
    }

    const leadIds = scopedLeads.map((item) => item.id);

    const scopedAppointments = await db
        .select({
            id: appointment.id,
            leadId: appointment.leadId,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            location: appointment.location,
            notes: appointment.notes,
            salesId: appointment.salesId,
            salesName: user.name,
            createdAt: appointment.createdAt,
            updatedAt: appointment.updatedAt,
            leadName: lead.name,
            leadPhone: lead.phone,
            assignedTo: lead.assignedTo,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .leftJoin(user, eq(appointment.salesId, user.id))
        .where(inArray(appointment.leadId, leadIds))
        .orderBy(asc(appointment.date), asc(appointment.time));

    return {
        leads: scopedLeads,
        appointments: scopedAppointments,
    };
}

function buildLineChartData(
    decoratedLeads: Array<LeadRow & { appointmentTag: string }>
) {
    const createdDates = decoratedLeads
        .map((item) => new Date(item.createdAt))
        .filter((date) => !Number.isNaN(date.getTime()));

    const sourceTotals = new Map<string, number>();
    for (const item of decoratedLeads) {
        const sourceKey = item.source || "Lainnya";
        sourceTotals.set(sourceKey, (sourceTotals.get(sourceKey) || 0) + 1);
    }

    const topSourceEntries = Array.from(sourceTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, LINE_CHART_TOP_SOURCE_LIMIT);
    const topSourceKeys = new Set(topSourceEntries.map(([key]) => key));
    const otherSourceTotal = Array.from(sourceTotals.entries())
        .filter(([key]) => !topSourceKeys.has(key))
        .reduce((sum, [, count]) => sum + count, 0);

    const sourceSeriesEntries = topSourceEntries.map(([key]) => ({
        key,
        label: key,
    }));
    if (otherSourceTotal > 0) {
        sourceSeriesEntries.push({
            key: "others",
            label: "Others",
        });
    }

    const lineChartData = Object.fromEntries(
        LINE_CHART_GRANULARITY_OPTIONS.map((option) => [option.key, {}])
    ) as Record<string, any>;

    for (const granularity of LINE_CHART_GRANULARITY_OPTIONS) {
        const periods = buildLineChartPeriods(createdDates, granularity.key);

        const sourceBucket = buildLineChartSeriesBucket(periods, sourceSeriesEntries);
        const l3Bucket = buildLineChartSeriesBucket(periods, [...LINE_CHART_L3_SERIES]);
        const l4Bucket = buildLineChartSeriesBucket(periods, [...LINE_CHART_L4_SERIES]);

        for (const item of decoratedLeads) {
            const createdAt = new Date(item.createdAt);
            if (Number.isNaN(createdAt.getTime())) {
                continue;
            }

            const periodStart = toPeriodStart(createdAt, granularity.key);
            const periodKey = formatPeriodKey(periodStart);

            const sourceRow = sourceBucket.rowMap.get(periodKey);
            if (sourceRow) {
                const sourceKey = topSourceKeys.has(item.source || "Lainnya")
                    ? item.source || "Lainnya"
                    : sourceSeriesEntries.some((entry) => entry.key === "others")
                        ? "others"
                        : item.source || "Lainnya";
                if (Object.prototype.hasOwnProperty.call(sourceRow.values, sourceKey)) {
                    sourceRow.values[sourceKey] += 1;
                    sourceBucket.totals.set(sourceKey, (sourceBucket.totals.get(sourceKey) || 0) + 1);
                }
            }

            const l3Row = l3Bucket.rowMap.get(periodKey);
            if (l3Row && (item.appointmentTag === "mau_survey" || item.appointmentTag === "sudah_survey")) {
                l3Row.values[item.appointmentTag] += 1;
                l3Bucket.totals.set(
                    item.appointmentTag,
                    (l3Bucket.totals.get(item.appointmentTag) || 0) + 1
                );
            }

            const l4Key = resolveTransactionStatusKey(item.resultStatus);
            const l4Row = l4Bucket.rowMap.get(periodKey);
            if (l4Row && l4Key && Object.prototype.hasOwnProperty.call(l4Row.values, l4Key)) {
                l4Row.values[l4Key] += 1;
                l4Bucket.totals.set(l4Key, (l4Bucket.totals.get(l4Key) || 0) + 1);
            }
        }

        lineChartData[granularity.key] = {
            source: {
                periods: sourceBucket.rows,
                series: sourceSeriesEntries.map((series) => ({
                    key: series.key,
                    label: series.label,
                    total: sourceBucket.totals.get(series.key) || 0,
                })),
            },
            l3: {
                periods: l3Bucket.rows,
                series: LINE_CHART_L3_SERIES.map((series) => ({
                    key: series.key,
                    label: series.label,
                    total: l3Bucket.totals.get(series.key) || 0,
                })),
            },
            l4: {
                periods: l4Bucket.rows,
                series: LINE_CHART_L4_SERIES.map((series) => ({
                    key: series.key,
                    label: series.label,
                    total: l4Bucket.totals.get(series.key) || 0,
                })),
            },
        };
    }

    return {
        defaultGranularity: "month",
        defaultDataset: "l4",
        granularityOptions: LINE_CHART_GRANULARITY_OPTIONS,
        datasetOptions: LINE_CHART_DATASET_OPTIONS,
        data: lineChartData,
    };
}

async function buildHierarchySummary(userId: string, role: string, scope?: QueryScope) {
    if (role === "root_admin") {
        const [clients, users] = await Promise.all([
            db
                .select({
                    id: client.id,
                    name: client.name,
                    slug: client.slug,
                    isActive: client.isActive,
                })
                .from(client)
                .orderBy(asc(client.name)),
            db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    clientId: user.clientId,
                    supervisorId: user.supervisorId,
                })
                .from(user)
                .where(eq(user.isActive, true)),
        ]);

        return {
            roleLabel: "Root Admin",
            counts: {
                clients: clients.length,
                clientAdmins: users.filter((item) => item.role === "client_admin").length,
                supervisors: users.filter((item) => item.role === "supervisor").length,
                sales: users.filter((item) => item.role === "sales").length,
            },
            clients: clients.map((tenant) => {
                const tenantUsers = users.filter((item) => item.clientId === tenant.id);
                return {
                    ...tenant,
                    clientAdmins: tenantUsers.filter((item) => item.role === "client_admin").length,
                    supervisors: tenantUsers.filter((item) => item.role === "supervisor").length,
                    sales: tenantUsers.filter((item) => item.role === "sales").length,
                };
            }),
        };
    }

    if (role === "client_admin" && scope?.clientId) {
        const [tenantRows, tenantUsers] = await Promise.all([
            db
                .select({
                    id: client.id,
                    name: client.name,
                    slug: client.slug,
                })
                .from(client)
                .where(eq(client.id, scope.clientId))
                .limit(1),
            db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    supervisorId: user.supervisorId,
                })
                .from(user)
                .where(and(eq(user.clientId, scope.clientId), eq(user.isActive, true))),
        ]);

        const supervisors = tenantUsers.filter((item) => item.role === "supervisor");
        const salesUsers = tenantUsers.filter((item) => item.role === "sales");

        return {
            roleLabel: "Client Admin",
            client: tenantRows[0] || null,
            counts: {
                supervisors: supervisors.length,
                sales: salesUsers.length,
            },
            supervisors: supervisors.map((supervisor) => ({
                id: supervisor.id,
                name: supervisor.name,
                email: supervisor.email,
                salesCount: salesUsers.filter((sales) => sales.supervisorId === supervisor.id).length,
            })),
        };
    }

    if (role === "supervisor") {
        const [supervisorRows, salesUsers] = await Promise.all([
            db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    clientId: user.clientId,
                    clientName: client.name,
                })
                .from(user)
                .leftJoin(client, eq(user.clientId, client.id))
                .where(eq(user.id, userId))
                .limit(1),
            db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                })
                .from(user)
                .where(and(eq(user.role, "sales"), eq(user.supervisorId, userId), eq(user.isActive, true)))
                .orderBy(asc(user.name)),
        ]);

        return {
            roleLabel: "Supervisor",
            client: supervisorRows[0]?.clientId
                ? {
                    id: supervisorRows[0].clientId,
                    name: supervisorRows[0].clientName,
                }
                : null,
            supervisor: supervisorRows[0] || null,
            counts: {
                sales: salesUsers.length,
            },
            sales: salesUsers,
        };
    }

    const salesRows = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            clientId: user.clientId,
            clientName: client.name,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(eq(user.id, userId))
        .limit(1);

    return {
        roleLabel: "Sales",
        client: salesRows[0]?.clientId
            ? {
                id: salesRows[0].clientId,
                name: salesRows[0].clientName,
            }
            : null,
        counts: {
            sales: 1,
        },
    };
}

export async function getHomeAnalytics(
    userId: string,
    role: string,
    scope?: QueryScope,
    filters?: DashboardDateRange
) {
    const { leads: scopedLeads, appointments: scopedAppointments } =
        await loadScopedLeadsAndAppointments(userId, role, scope, filters);

    // Fetch unique supervisor names mapped from leads
    const supervisorIdsMap = new Set<string>();
    for (const lead of scopedLeads) {
        if (lead.supervisorId) supervisorIdsMap.add(lead.supervisorId);
    }
    const supervisorIdsList = Array.from(supervisorIdsMap);
    const supervisorNameMap = new Map<string, string>();
    if (supervisorIdsList.length > 0) {
        const sups = await db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, supervisorIdsList));
        sups.forEach((s) => supervisorNameMap.set(s.id, s.name));
    }

    const latestAppointmentByLead = getLatestAppointmentByLead(scopedAppointments);

    const decoratedLeads = scopedLeads.map((item) => {
        const latestAppointment = latestAppointmentByLead.get(item.id) || null;
        return {
            ...item,
            flowStatus: normalizeFlowStatus(item.flowStatus, item.assignedTo),
            appointmentTag: resolveAppointmentTag(latestAppointment),
            latestAppointment,
        };
    });

    const totalLeads = decoratedLeads.length;
    const surveyedLeads = decoratedLeads.filter(
        (item) => item.appointmentTag === "sudah_survey"
    ).length;

    const flowOverview = {
        open: decoratedLeads.filter((item) => item.flowStatus === "open").length,
        assigned: decoratedLeads.filter((item) => item.flowStatus === "assigned").length,
        accepted: decoratedLeads.filter((item) => item.flowStatus === "accepted").length,
    };

    const surveyRatio = {
        totalLeads,
        surveyedLeads,
        ratioPercent: toPercent(surveyedLeads, totalLeads),
    };

    const statusCounts = new Map<string, number>();
    for (const item of decoratedLeads) {
        const key = item.salesStatus || "unfilled";
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    }

    const statusPieItems = [
        ...SALES_STATUS_META.map((status) => ({
            key: status.key,
            label: status.label,
            count: statusCounts.get(status.key) || 0,
        })),
        {
            key: "unfilled",
            label: "Belum Diisi",
            count: statusCounts.get("unfilled") || 0,
        },
    ].map((item) => ({
        ...item,
        percentage: toPercent(item.count, totalLeads),
    }));

    const domicileMap = new Map<string, number>();
    for (const item of decoratedLeads) {
        const city = item.domicileCity;
        if (!city) {
            continue;
        }
        domicileMap.set(city, (domicileMap.get(city) || 0) + 1);
    }

    const domicileBars = Array.from(domicileMap.entries())
        .map(([city, count]) => ({
            city,
            count,
            percentage: toPercent(count, totalLeads),
        }))
        .sort((a, b) => b.count - a.count);

    const ongoingAppointments = scopedAppointments
        .map((item) => ({
            ...item,
            appointmentTag: resolveAppointmentTag(item),
            appointmentAt: toAppointmentDateTime(item.date, item.time),
        }))
        .filter((item) => item.appointmentTag === "mau_survey")
        .sort((a, b) => a.appointmentAt.getTime() - b.appointmentAt.getTime())
        .map(({ appointmentAt, ...item }) => item)
        .slice(0, 20);

    const resultCounts = new Map<string, number>();
    for (const item of decoratedLeads) {
        const key = item.resultStatus || "none";
        resultCounts.set(key, (resultCounts.get(key) || 0) + 1);
    }

    const resultRecapItems = RESULT_STATUS_META.map((status) => {
        const count = resultCounts.get(status.key) || 0;
        return {
            key: status.key,
            label: status.label,
            count,
            percentage: toPercent(count, totalLeads),
        };
    });

    const cancelledLeads = decoratedLeads.filter(
        (item) => item.resultStatus === "cancel" && item.rejectedReason
    );
    const cancelReasonClientIds = Array.from(
        new Set(
            cancelledLeads
                .map((item) => item.clientId)
                .filter((value): value is string => Boolean(value))
        )
    );
    const cancelReasonCodes = Array.from(
        new Set(
            cancelledLeads
                .map((item) => item.rejectedReason)
                .filter((value): value is string => Boolean(value))
        )
    );
    const cancelReasonLabelMap = new Map<string, string>();
    if (cancelReasonClientIds.length > 0 && cancelReasonCodes.length > 0) {
        const cancelReasonRows = await db
            .select({
                clientId: cancelReason.clientId,
                code: cancelReason.code,
                label: cancelReason.label,
            })
            .from(cancelReason)
            .where(
                and(
                    inArray(cancelReason.clientId, cancelReasonClientIds),
                    inArray(cancelReason.code, cancelReasonCodes)
                )
            );

        for (const row of cancelReasonRows) {
            if (!cancelReasonLabelMap.has(row.code)) {
                cancelReasonLabelMap.set(row.code, row.label);
            }
        }
    }

    const cancelReasonMap = new Map<string, number>();
    for (const item of cancelledLeads) {
        const reason = item.rejectedReason || "lainnya";
        cancelReasonMap.set(reason, (cancelReasonMap.get(reason) || 0) + 1);
    }

    const cancelReasonItems = Array.from(cancelReasonMap.entries())
        .map(([key, count]) => ({
            key,
            label: cancelReasonLabelMap.get(key) || humanizeKey(key),
            count,
            percentage: toPercent(count, cancelledLeads.length),
        }))
        .sort((a, b) => b.count - a.count);

    let perAgentSurveyRatio: Array<{
        salesId: string;
        salesName: string;
        totalLeads: number;
        surveyedLeads: number;
        ratioPercent: number;
    }> = [];

    const isManagerRole = role === "root_admin" || role === "client_admin" || role === "supervisor";

    if (isManagerRole) {
        // Build scoped sales user list
        let salesCondition: any = eq(user.role, "sales");
        if (role === "client_admin" && scope?.clientId) {
            salesCondition = and(eq(user.role, "sales"), eq(user.clientId, scope.clientId));
        } else if (role === "supervisor" && scope?.managedSalesIds && scope.managedSalesIds.length > 0) {
            salesCondition = inArray(user.id, scope.managedSalesIds);
        }

        const salesUsers = await db
            .select({
                id: user.id,
                name: user.name,
            })
            .from(user)
            .where(salesCondition)
            .orderBy(asc(user.name));

        perAgentSurveyRatio = salesUsers.map((sales) => {
            const ownLeads = decoratedLeads.filter((item) => item.assignedTo === sales.id);
            const ownSurveyed = ownLeads.filter(
                (item) => item.appointmentTag === "sudah_survey"
            ).length;
            return {
                salesId: sales.id,
                salesName: sales.name,
                totalLeads: ownLeads.length,
                surveyedLeads: ownSurveyed,
                ratioPercent: toPercent(ownSurveyed, ownLeads.length),
            };
        });
    }

    const holdLeads =
        isManagerRole
            ? decoratedLeads
                .filter((item) => item.flowStatus === "hold")
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                )
                .slice(0, 50)
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    phone: item.phone,
                    source: item.source,
                    createdAt: item.createdAt,
                    receivedAt: item.createdAt,
                }))
            : [];

    // --- NEW AGGREGATIONS FOR V2 DASHBOARD ---
    let userConditions: any = eq(user.isActive, true);
    if (role === "client_admin" && scope?.clientId) {
        userConditions = and(userConditions, eq(user.clientId, scope.clientId));
    } else if (role === "supervisor") {
        userConditions = and(userConditions, inArray(user.id, [userId, ...(scope?.managedSalesIds || [])]));
    } else if (role === "sales") {
        userConditions = and(userConditions, eq(user.id, userId));
    }

    const allScopedUsers = await db
        .select({
            id: user.id,
            name: user.name,
            role: user.role,
            supervisorId: user.supervisorId
        })
        .from(user)
        .where(userConditions);

    const teamStats = new Map<string, any>();

    // 1. Pre-fill Supervisors
    for (const u of allScopedUsers) {
        if (u.role === "supervisor") {
            if (!teamStats.has(u.id)) {
                teamStats.set(u.id, {
                    teamId: u.id, teamName: u.name,
                    ongoing: 0,
                    reserve: 0,
                    onProcess: 0,
                    fullBook: 0,
                    akad: 0,
                    cancel: 0,
                    hold: 0,
                    skip: 0,
                    prospek: 0,
                    survey: 0,
                    mauSurvey: 0,
                    hot: 0,
                    potensi: 0,
                    batal: 0,
                    cancelReasons: {} as Record<string, number>,
                    salesMap: new Map<string, any>()
                });
            }
        }
    }

    // 2. Pre-fill Sales
    for (const s of allScopedUsers) {
        if (s.role === "sales") {
            const supId = s.supervisorId || 'unassigned_sup';
            
            if (!teamStats.has(supId)) {
                teamStats.set(supId, {
                    teamId: supId, teamName: supervisorNameMap.get(supId) || (supId === 'unassigned_sup' ? 'Unassigned Supervisor' : 'Unknown Supervisor'),
                    ongoing: 0,
                    reserve: 0,
                    onProcess: 0,
                    fullBook: 0,
                    akad: 0,
                    cancel: 0,
                    hold: 0,
                    skip: 0,
                    prospek: 0,
                    survey: 0,
                    mauSurvey: 0,
                    hot: 0,
                    potensi: 0,
                    batal: 0,
                    cancelReasons: {} as Record<string, number>,
                    salesMap: new Map<string, any>()
                });
            }
            
            const stats = teamStats.get(supId)!;
            stats.salesMap.set(s.id, {
                salesId: s.id, salesName: s.name,
                ongoing: 0,
                reserve: 0,
                onProcess: 0,
                fullBook: 0,
                akad: 0,
                cancel: 0,
                hold: 0,
                skip: 0,
                prospek: 0,
                survey: 0,
                mauSurvey: 0,
                hot: 0,
                potensi: 0,
                batal: 0,
            });
        }
    }
    let totalOngoing = 0;
    let totalClosing = 0;
    let totalFullBook = 0;
    let totalPotensi = 0;
    let totalBatal = 0;
    let totalMauSurvey = 0;
    let totalHot = 0;
    let totalHotValidated = 0;

    const sourceCounts = new Map<string, number>();
    const picAgentComparisonMaps = new Map<
        string,
        {
            agent: number;
            others: number;
        }
    >();
    const unitTypeBreakdownMaps = new Map<string, Map<string, number>>();
    const transactionSourceBreakdownMaps = new Map<string, Map<string, number>>();
    const databaseStatusScopeMap = new Map<string, ReturnType<typeof createDatabaseStatusScopeBucket>>();

    const ensureDatabaseStatusScope = (scopeId: string) => {
        if (!databaseStatusScopeMap.has(scopeId)) {
            databaseStatusScopeMap.set(scopeId, createDatabaseStatusScopeBucket());
        }

        return databaseStatusScopeMap.get(scopeId)!;
    };

    ensureDatabaseStatusScope("all");

    for (const item of TRANSACTION_STATUS_META) {
        picAgentComparisonMaps.set(item.key, {
            agent: 0,
            others: 0,
        });
        unitTypeBreakdownMaps.set(item.key, new Map<string, number>());
        transactionSourceBreakdownMaps.set(item.key, new Map<string, number>());
    }

    for (const item of decoratedLeads) {
        const supervisorId = item.supervisorId || 'unassigned_sup';
        const supervisorName = supervisorNameMap.get(supervisorId) || 'Unassigned Supervisor';

        const salesId = item.assignedTo || 'unassigned_sales';
        const salesName = item.assignedUserName || 'Unassigned Sales';

        if (!teamStats.has(supervisorId)) {
            teamStats.set(supervisorId, {
                teamId: supervisorId,
                teamName: supervisorName,
                ongoing: 0,
                closing: 0,
                reserve: 0,
                onProcess: 0,
                fullBook: 0,
                akad: 0,
                cancel: 0,
                hold: 0,
                skip: 0,
                prospek: 0,
                survey: 0,
                mauSurvey: 0,
                hot: 0,
                potensi: 0,
                batal: 0,
                cancelReasons: {} as Record<string, number>,
                salesMap: new Map<string, any>()
            });
        }
        const stats = teamStats.get(supervisorId)!;

        if (!stats.salesMap.has(salesId)) {
            stats.salesMap.set(salesId, {
                salesId, salesName,
                ongoing: 0,
                closing: 0,
                reserve: 0,
                onProcess: 0,
                fullBook: 0,
                akad: 0,
                cancel: 0,
                hold: 0,
                skip: 0,
                prospek: 0,
                survey: 0,
                mauSurvey: 0,
                hot: 0,
                potensi: 0,
                batal: 0,
                conversionRate: 0
            });
        }
        const sStats = stats.salesMap.get(salesId)!;

        // Source Breakdown
        const src = item.source || "Lainnya";
        sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);

        const transactionStatusKey = resolveTransactionStatusKey(item.resultStatus);
        if (transactionStatusKey) {
            const picAgentBucket = picAgentComparisonMaps.get(transactionStatusKey);
            const picAgentTotalBucket = picAgentComparisonMaps.get("all");
            const isPicAgentOwned = toLowerTrimmed(item.assignedUserEmail) === PIC_AGENT_EMAIL;
            const isAgentSource = toLowerTrimmed(item.source) === "agent";
            const targetKey = isAgentSource || isPicAgentOwned ? "agent" : "others";

            if (picAgentBucket) {
                picAgentBucket[targetKey] += 1;
            }
            if (picAgentTotalBucket) {
                picAgentTotalBucket[targetKey] += 1;
            }

            const unitType = resolveTransactionUnitType(item);
            const statusUnitTypeMap = unitTypeBreakdownMaps.get(transactionStatusKey);
            const totalUnitTypeMap = unitTypeBreakdownMaps.get("all");

            if (statusUnitTypeMap) {
                statusUnitTypeMap.set(unitType, (statusUnitTypeMap.get(unitType) || 0) + 1);
            }
            if (totalUnitTypeMap) {
                totalUnitTypeMap.set(unitType, (totalUnitTypeMap.get(unitType) || 0) + 1);
            }

            const transactionSourceMap = transactionSourceBreakdownMaps.get(transactionStatusKey);
            const totalTransactionSourceMap = transactionSourceBreakdownMaps.get("all");
            const sourceLabel = item.source || "Lainnya";

            if (transactionSourceMap) {
                transactionSourceMap.set(sourceLabel, (transactionSourceMap.get(sourceLabel) || 0) + 1);
            }
            if (totalTransactionSourceMap) {
                totalTransactionSourceMap.set(sourceLabel, (totalTransactionSourceMap.get(sourceLabel) || 0) + 1);
            }
        }

        const databaseScopeIds = ["all", supervisorId];
        for (const scopeId of databaseScopeIds) {
            const scopeBucket = ensureDatabaseStatusScope(scopeId);
            scopeBucket.totalData += 1;
            incrementStatusCount(scopeBucket, "l1", item.flowStatus, "open");
            incrementStatusCount(scopeBucket, "l2", item.salesStatus, "unfilled");
            incrementStatusCount(scopeBucket, "l3", item.appointmentTag, "none");
            incrementStatusCount(scopeBucket, "l4", resolveTransactionStatusKey(item.resultStatus), "none");
        }

        stats.prospek += 1;
        sStats.prospek += 1;

        const isHold = item.flowStatus === "hold";
        const isSkip = item.salesStatus === "skip";
        const isSurvey = item.appointmentTag === "sudah_survey";
        const isMauSurvey = item.appointmentTag === "mau_survey";
        const isHot = item.salesStatus === "hot";
        const isPotensi = item.salesStatus === "hot" || item.salesStatus === "warm";
        
        const rStatus = String(item.resultStatus || '').toLowerCase();

        const isReserve = rStatus === 'reserve';
        const isOnProcess = rStatus === 'on_process';
        const isFullBook = rStatus === 'full_book';
        const isAkad = rStatus === 'akad';
        const isCancel = rStatus === 'cancel';

        if (isAkad) {
            stats.akad += 1; sStats.akad += 1;
            totalClosing += 1;
        } else if (isCancel) {
            stats.cancel += 1; sStats.cancel += 1;
            totalBatal += 1;
            const reason = item.rejectedReason || "Lainnya";
            stats.cancelReasons[reason] = (stats.cancelReasons[reason] || 0) + 1;
        } else if (isHold) {
            stats.hold += 1; sStats.hold += 1;
        } else if (isSkip) {
            stats.skip += 1; sStats.skip += 1;
        } else {
            stats.ongoing += 1; sStats.ongoing += 1;
            totalOngoing += 1;
        }

        if (isSurvey) { stats.survey += 1; sStats.survey += 1; }
        if (isMauSurvey) {
            stats.mauSurvey += 1; sStats.mauSurvey += 1;
            totalMauSurvey += 1;
        }
        if (isHot) {
            stats.hot += 1; sStats.hot += 1;
            totalHot += 1;
            if (item.validated) {
                totalHotValidated += 1;
            }
        }
        if (isPotensi) {
            stats.potensi += 1; sStats.potensi += 1;
            totalPotensi += 1;
        }

        if (isReserve) { stats.reserve += 1; sStats.reserve += 1; }
        if (isOnProcess) { stats.onProcess += 1; sStats.onProcess += 1; }
        if (isFullBook) {
            stats.fullBook += 1; sStats.fullBook += 1;
            totalFullBook += 1;
        }
    }

    const teamList = Array.from(teamStats.values()).map(t => {
        const salesList = Array.from(t.salesMap.values() as any[]).map((s: any) => ({
            ...s,
            prospectRate: toPercent((s.hot || 0) + (s.mauSurvey || 0), s.prospek),
            surveyRate: toPercent(s.survey, s.prospek),
            closingRate: toPercent(s.fullBook, s.prospek),
            conversionRate: toPercent(s.akad, s.survey || s.prospek)
        })).sort((a, b) => {
            if ((b.fullBook || 0) !== (a.fullBook || 0)) {
                return (b.fullBook || 0) - (a.fullBook || 0);
            }
            return (b.prospek || 0) - (a.prospek || 0);
        });

        return {
            teamId: t.teamId,
            teamName: t.teamName,
            ongoing: t.ongoing,
            reserve: t.reserve,
            onProcess: t.onProcess,
            fullBook: t.fullBook,
            akad: t.akad,
            cancel: t.cancel,
            hold: t.hold,
            skip: t.skip,
            prospek: t.prospek,
            survey: t.survey,
            mauSurvey: t.mauSurvey,
            hot: t.hot,
            potensi: t.potensi,
            cancelReasons: t.cancelReasons,
            prospectRate: toPercent((t.hot || 0) + (t.mauSurvey || 0), t.prospek),
            surveyRate: toPercent(t.survey, t.prospek),
            closingRate: toPercent(t.fullBook, t.prospek),
            conversionRate: toPercent(t.akad, t.survey || t.prospek),
            sales: salesList
        };
    }).sort((a, b) => b.ongoing - a.ongoing); 

    const sourceBreakdown = Array.from(sourceCounts.entries()).map(([source, count]) => ({
        source,
        count,
        percentage: toPercent(count, totalLeads)
    })).sort((a, b) => b.count - a.count);
    const lineChart = buildLineChartData(decoratedLeads);

    for (const team of teamList) {
        ensureDatabaseStatusScope(team.teamId);
    }

    const transactionRecap = {
        totalOngoing,
        totalAkad: teamList.reduce((acc, t) => acc + t.akad, 0),
        totalReserve: teamList.reduce((acc, t) => acc + t.reserve, 0),
        totalOnProcess: teamList.reduce((acc, t) => acc + t.onProcess, 0),
        totalFullBook: teamList.reduce((acc, t) => acc + t.fullBook, 0),
        totalCancel: teamList.reduce((acc, t) => acc + t.cancel, 0),
        teams: teamList,
        chartStatusOptions: TRANSACTION_STATUS_META,
        picAgentComparison: Object.fromEntries(
            Array.from(picAgentComparisonMaps.entries()).map(([key, value]) => [
                key,
                {
                    agent: value.agent,
                    others: value.others,
                    total: value.agent + value.others,
                },
            ])
        ),
        unitTypeBreakdown: Object.fromEntries(
            Array.from(unitTypeBreakdownMaps.entries()).map(([key, unitTypeMap]) => [
                key,
                Array.from(unitTypeMap.entries())
                    .map(([label, count]) => ({
                        label,
                        count,
                    }))
                    .sort((a, b) => b.count - a.count),
            ])
        ),
        transactionSourceBreakdown: Object.fromEntries(
            Array.from(transactionSourceBreakdownMaps.entries()).map(([key, sourceMap]) => [
                key,
                Array.from(sourceMap.entries())
                    .map(([label, count]) => ({
                        label,
                        count,
                    }))
                    .sort((a, b) => b.count - a.count),
            ])
        ),
    };

    const teamPerformance = {
        totalProspek: totalLeads,
        totalLeads,
        totalSurvey: surveyedLeads,
        totalMauSurvey,
        totalHot,
        totalHotValidated,
        totalFullBook,
        totalPotensi,
        totalBatal,
        totalClosing: totalFullBook,
        prospectRate: toPercent(totalHot + totalMauSurvey, totalLeads),
        surveyRate: toPercent(surveyedLeads, totalLeads),
        closingRate: toPercent(totalFullBook, totalLeads),
        conversionRate: toPercent(totalClosing, surveyedLeads || totalLeads),
        teams: teamList
    };

    const databaseControl = {
        totalData: totalLeads,
        closingRate: toPercent(totalClosing, totalLeads),
        surveyRate: toPercent(surveyedLeads, totalLeads),
        prospectRate: toPercent(totalPotensi, totalLeads),
        sourceBreakdown,
        domicileBreakdown: domicileBars,
        cancelReasonBreakdown: cancelReasonItems,
        statusBreakdown: statusPieItems,
        scopeOptions: teamList.map((team) => ({
            key: team.teamId,
            label: team.teamName,
        })),
        statusLayerOptions: DATABASE_STATUS_LAYER_OPTIONS,
        statusLayerBreakdown: Object.fromEntries(
            Array.from(databaseStatusScopeMap.entries()).map(([scopeId, bucket]) => [
                scopeId,
                {
                    totalData: bucket.totalData,
                    layers: Object.fromEntries(
                        Object.entries(bucket.layers).map(([layerKey, layerMap]) => [
                            layerKey,
                            DATABASE_STATUS_LAYER_META[layerKey as keyof typeof DATABASE_STATUS_LAYER_META].map((status) => ({
                                key: status.key,
                                label: status.label,
                                count: layerMap.get(status.key) || 0,
                            })),
                        ])
                    ),
                },
            ])
        ),
    };

    return {
        scope: isManagerRole ? "overall" : "agent",
        hierarchySummary: await buildHierarchySummary(userId, role, scope),
        flowOverview,
        surveyRatio,
        perAgentSurveyRatio,
        statusPie: {
            total: totalLeads,
            items: statusPieItems,
        },
        domicileBars,
        ongoingAppointments,
        resultRecap: {
            total: totalLeads,
            items: resultRecapItems,
            cancelReasons: {
                total: cancelledLeads.length,
                items: cancelReasonItems,
            },
        },
        holdLeads,
        transactionRecap,
        teamPerformance,
        databaseControl,
        lineChart,
    };
}
