import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "../db/index";
import { appointment, cancelReason, client, lead, projectUnit, user } from "../db/schema";
import { resolveAppointmentTag, toAppointmentDateTime } from "../utils/appointment";
import type { QueryScope } from "../middleware/rbac";
import { isCancelResultStatus } from "../utils/lead-workflow";
import * as leadSourcesService from "./lead-sources.service";

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
    receivedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    resultStatusUpdatedAt: Date | null;
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
    { key: "cancel_transaksi", label: "Cancel Transaksi" },
    { key: "cancel_minat", label: "Cancel Minat" },
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
        { key: "cancel_transaksi", label: "Cancel Transaksi" },
        { key: "cancel_minat", label: "Cancel Minat" },
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
    { key: "cancel_transaksi", label: "Cancel Transaksi" },
    { key: "cancel_minat", label: "Cancel Minat" },
] as const;
const DAILY_REPORT_TIMEZONE = "Asia/Jakarta";
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function toLowerTrimmed(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase();
}

function getJakartaDateParts(now: Date) {
    const shifted = new Date(now.getTime() + JAKARTA_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        monthIndex: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
}

function jakartaDateToUtc(
    year: number,
    monthIndex: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    ms = 0
) {
    return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms) - JAKARTA_OFFSET_MS);
}

function getJakartaTodayWindow(now = new Date()) {
    const parts = getJakartaDateParts(now);
    return {
        start: jakartaDateToUtc(parts.year, parts.monthIndex, parts.day),
        end: jakartaDateToUtc(parts.year, parts.monthIndex, parts.day, 23, 59, 59, 999),
        monthStart: jakartaDateToUtc(parts.year, parts.monthIndex, 1),
        label: new Intl.DateTimeFormat("id-ID", {
            timeZone: DAILY_REPORT_TIMEZONE,
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(now).toUpperCase(),
    };
}

function humanizeKey(value: string | null | undefined) {
    return String(value || "Lainnya")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveTransactionStatusKey(resultStatus: string | null | undefined) {
    const normalized = toLowerTrimmed(resultStatus);
    if (isCancelResultStatus(normalized)) {
        return "cancel";
    }
    if (
        normalized === "akad" ||
        normalized === "full_book" ||
        normalized === "on_process" ||
        normalized === "reserve"
    ) {
        return normalized;
    }
    return null;
}

function resolveDatabaseResultStatusKey(resultStatus: string | null | undefined) {
    const normalized = toLowerTrimmed(resultStatus);
    if (normalized === "cancel") {
        return "cancel_transaksi";
    }
    if (
        normalized === "akad" ||
        normalized === "full_book" ||
        normalized === "on_process" ||
        normalized === "reserve" ||
        normalized === "cancel_transaksi" ||
        normalized === "cancel_minat"
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

function buildLineChartPeriods(
    dates: Date[],
    granularity: string,
    range?: { dateFrom: Date | null; dateTo: Date | null }
) {
    const rangeDates = [range?.dateFrom, range?.dateTo].filter(
        (date): date is Date => Boolean(date && !Number.isNaN(date.getTime()))
    );
    const validDates = (rangeDates.length > 0 ? rangeDates : dates)
        .filter((date) => !Number.isNaN(date.getTime()));
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

function buildLeadScopeConditions(
    userId: string,
    role: string,
    scope?: QueryScope
) {
    const conditions: any[] = [];

    if (role === "root_admin") {
        return conditions;
    }

    if (scope?.clientId) {
        conditions.push(eq(lead.clientId, scope.clientId));
    }

    if (role === "client_admin") {
        return conditions;
    }

    if (
        role === "supervisor" &&
        scope?.managedSalesIds &&
        scope.managedSalesIds.length > 0
    ) {
        conditions.push(inArray(lead.assignedTo, scope.managedSalesIds));
        return conditions;
    }

    if (role === "supervisor") {
        conditions.push(eq(lead.assignedTo, "__none__"));
        return conditions;
    }

    conditions.push(eq(lead.assignedTo, userId));
    return conditions;
}

async function loadScopedLeadsAndAppointments(
    userId: string,
    role: string,
    scope?: QueryScope,
    filters?: DashboardDateRange
) {
    const conditions = buildLeadScopeConditions(userId, role, scope);

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
            receivedAt: lead.receivedAt,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            resultStatusUpdatedAt: lead.resultStatusUpdatedAt,
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
    decoratedLeads: Array<LeadRow & { appointmentTag: string }>,
    range?: { dateFrom: Date | null; dateTo: Date | null }
) {
    const receivedDates = decoratedLeads
        .map((item) => new Date(item.receivedAt || item.createdAt))
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
        const periods = buildLineChartPeriods(receivedDates, granularity.key, range);

        const sourceBucket = buildLineChartSeriesBucket(periods, sourceSeriesEntries);
        const l3Bucket = buildLineChartSeriesBucket(periods, [...LINE_CHART_L3_SERIES]);
        const l4Bucket = buildLineChartSeriesBucket(periods, [...LINE_CHART_L4_SERIES]);

        for (const item of decoratedLeads) {
            const receivedAt = new Date(item.receivedAt || item.createdAt);
            if (Number.isNaN(receivedAt.getTime())) {
                continue;
            }

            const periodStart = toPeriodStart(receivedAt, granularity.key);
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

            const l4Key = resolveDatabaseResultStatusKey(item.resultStatus);
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

async function buildDailySalesReport(
    userId: string,
    role: string,
    scope?: QueryScope,
    now = new Date()
) {
    const todayWindow = getJakartaTodayWindow(now);
    const baseConditions = buildLeadScopeConditions(userId, role, scope);
    const dateRelevantCondition = or(
        and(gte(lead.receivedAt, todayWindow.start), lte(lead.receivedAt, todayWindow.end)),
        and(gte(lead.resultStatusUpdatedAt, todayWindow.monthStart), lte(lead.resultStatusUpdatedAt, todayWindow.end)),
        and(gte(lead.updatedAt, todayWindow.monthStart), lte(lead.updatedAt, todayWindow.end))
    );
    const conditions = [...baseConditions];
    if (dateRelevantCondition) {
        conditions.push(dateRelevantCondition);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
        .select({
            id: lead.id,
            source: lead.source,
            assignedTo: lead.assignedTo,
            assignedUserName: user.name,
            resultStatus: lead.resultStatus,
            receivedAt: lead.receivedAt,
            updatedAt: lead.updatedAt,
            resultStatusUpdatedAt: lead.resultStatusUpdatedAt,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(whereClause);

    const isSource = (value: string | null | undefined, expected: string) =>
        toLowerTrimmed(value) === expected.toLowerCase();
    const isTodayReceived = (value: Date | string | null | undefined) => {
        if (!value) {
            return false;
        }
        const date = value instanceof Date ? value : new Date(value);
        return date.getTime() >= todayWindow.start.getTime() && date.getTime() <= todayWindow.end.getTime();
    };
    const isCurrentMonthStatus = (item: {
        resultStatusUpdatedAt: Date | null;
        updatedAt: Date;
    }) => {
        const statusDate = item.resultStatusUpdatedAt || item.updatedAt;
        if (!statusDate) {
            return false;
        }
        const date = statusDate instanceof Date ? statusDate : new Date(statusDate);
        return date.getTime() >= todayWindow.monthStart.getTime() && date.getTime() <= todayWindow.end.getTime();
    };

    const todayRows = rows.filter((item) => isTodayReceived(item.receivedAt));
    const nonAgentAssignedRows = todayRows.filter(
        (item) => !isSource(item.source, "Agent") && Boolean(item.assignedTo)
    );

    const salesConditions: any[] = [eq(user.role, "sales"), eq(user.isActive, true)];
    if (role === "sales") {
        salesConditions.push(eq(user.id, userId));
    } else if (role === "supervisor") {
        if (scope?.managedSalesIds?.length) {
            salesConditions.push(inArray(user.id, scope.managedSalesIds));
        } else {
            salesConditions.push(eq(user.id, "__none__"));
        }
    } else if (role !== "root_admin" && scope?.clientId) {
        salesConditions.push(eq(user.clientId, scope.clientId));
    }

    const activeSalesRows = await db
        .select({
            id: user.id,
            name: user.name,
            clientId: user.clientId,
        })
        .from(user)
        .where(and(...salesConditions))
        .orderBy(asc(user.name));

    const sourceClientIds = scope?.clientId
        ? [scope.clientId]
        : Array.from(
            new Set(
                activeSalesRows
                    .map((item) => item.clientId)
                    .filter((value): value is string => Boolean(value))
            )
        );
    const configuredSourceRows = (
        await Promise.all(sourceClientIds.map((clientId) => leadSourcesService.listLeadSources(clientId)))
    ).flat();
    const defaultSourceMap = new Map<string, string>();

    for (const sourceRow of configuredSourceRows) {
        if (isSource(sourceRow.value, "Agent")) {
            continue;
        }
        defaultSourceMap.set(toLowerTrimmed(sourceRow.value), sourceRow.value);
    }

    for (const item of nonAgentAssignedRows) {
        const sourceValue = item.source || "Lainnya";
        defaultSourceMap.set(toLowerTrimmed(sourceValue), sourceValue);
    }

    const defaultSourceRows = Array.from(defaultSourceMap.values())
        .sort((a, b) => a.localeCompare(b));

    const leadsBySourceMap = new Map<string, {
        source: string;
        total: number;
        bySales: Map<string, { salesId: string; salesName: string; count: number }>;
    }>();
    const leadsBySalesMap = new Map<string, {
        salesId: string;
        salesName: string;
        total: number;
        bySource: Map<string, { source: string; count: number }>;
    }>();

    for (const sales of activeSalesRows) {
        leadsBySalesMap.set(sales.id, {
            salesId: sales.id,
            salesName: sales.name,
            total: 0,
            bySource: new Map(
                defaultSourceRows.map((sourceValue) => [
                    toLowerTrimmed(sourceValue),
                    { source: sourceValue, count: 0 },
                ])
            ),
        });
    }

    for (const item of nonAgentAssignedRows) {
        const src = item.source || "Lainnya";
        const key = src.toLowerCase();

        let sourceGrp = leadsBySourceMap.get(key);
        if (!sourceGrp) {
            sourceGrp = { source: src, total: 0, bySales: new Map() };
            leadsBySourceMap.set(key, sourceGrp);
        }

        sourceGrp.total += 1;

        const salesKey = item.assignedTo || "unassigned";
        let salesObj = sourceGrp.bySales.get(salesKey);
        if (!salesObj) {
            salesObj = { salesId: salesKey, salesName: item.assignedUserName || "Unassigned", count: 0 };
            sourceGrp.bySales.set(salesKey, salesObj);
        }
        salesObj.count += 1;

        let salesGrp = leadsBySalesMap.get(salesKey);
        if (!salesGrp) {
            salesGrp = {
                salesId: salesKey,
                salesName: item.assignedUserName || "Unassigned",
                total: 0,
                bySource: new Map(),
            };
            leadsBySalesMap.set(salesKey, salesGrp);
        }

        salesGrp.total += 1;
        const sourceObj = salesGrp.bySource.get(key) || { source: src, count: 0 };
        sourceObj.count += 1;
        salesGrp.bySource.set(key, sourceObj);
    }

    const leadsBySource = Array.from(leadsBySourceMap.values()).map(grp => ({
        source: grp.source,
        total: grp.total,
        bySales: Array.from(grp.bySales.values()).sort((a, b) => b.count - a.count || a.salesName.localeCompare(b.salesName)),
    })).sort((a, b) => b.total - a.total);
    const leadsBySales = Array.from(leadsBySalesMap.values()).map(grp => ({
        salesId: grp.salesId,
        salesName: grp.salesName,
        total: grp.total,
        bySource: Array.from(grp.bySource.values()).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    })).sort((a, b) => b.total - a.total || a.salesName.localeCompare(b.salesName));

    const soldRows = rows.filter(
        (item) => item.resultStatus === "akad" && isCurrentMonthStatus(item)
    );
    const reservedRows = rows.filter(
        (item) =>
            (item.resultStatus === "full_book" ||
                item.resultStatus === "reserve" ||
                item.resultStatus === "on_process") &&
            isCurrentMonthStatus(item)
    );

    return {
        title: `Daily Sales Report ${todayWindow.label}`,
        dateLabel: todayWindow.label,
        generatedAt: now,
        walkIn: todayRows.filter((item) => isSource(item.source, "Walk In")).length,
        callIn: todayRows.filter((item) => isSource(item.source, "Call In")).length,
        leadsBySource,
        leadsBySales,
        leadAgent: todayRows.filter((item) => isSource(item.source, "Agent")).length,
        totalSold: soldRows.length,
        totalReserved: reservedRows.length,
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
                .where(eq(user.isActive, true)),
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
    const normalizedDateRange = normalizeDateRange(filters);
    const { leads: scopedLeads, appointments: scopedAppointments } =
        await loadScopedLeadsAndAppointments(userId, role, scope, filters);

    const unitConditions: any[] = [];
    if (scope?.clientId) {
        unitConditions.push(eq(projectUnit.clientId, scope.clientId));
    } else if (role !== "root_admin") {
        const u = await db.select({ clientId: user.clientId }).from(user).where(eq(user.id, userId)).limit(1);
        if (u[0]?.clientId) {
            unitConditions.push(eq(projectUnit.clientId, u[0].clientId));
        }
    }

    const units = await db
        .select({
            unitName: projectUnit.unitName,
        })
        .from(projectUnit)
        .where(unitConditions.length > 0 ? and(...unitConditions) : undefined)
        .orderBy(asc(projectUnit.unitName));

    const unitOptions = Array.from(new Set(units.map(u => u.unitName))).map(name => ({
        value: name,
        label: name
    }));

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
        const key = resolveDatabaseResultStatusKey(item.resultStatus) || "none";
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
        (item) => isCancelResultStatus(item.resultStatus) && item.rejectedReason
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
    const dailySalesReport = isManagerRole
        ? await buildDailySalesReport(userId, role, scope)
        : null;

    if (isManagerRole) {
        // Build scoped sales user list
        let salesCondition: any = eq(user.role, "sales");
        if (role === "supervisor" && scope?.managedSalesIds && scope.managedSalesIds.length > 0) {
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
    if (role === "supervisor") {
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

    const resolveSourceLabel = (value: string | null | undefined) => String(value || "").trim() || "Lainnya";
    const createEmptyTeamStats = (teamId: string, teamName: string) => ({
        teamId,
        teamName,
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
        hotValidated: 0,
        potensi: 0,
        batal: 0,
        cancelReasons: {} as Record<string, number>,
        salesMap: new Map<string, any>(),
    });
    const createEmptySalesStats = (salesId: string, salesName: string) => ({
        salesId,
        salesName,
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
        hotValidated: 0,
        potensi: 0,
        batal: 0,
        conversionRate: 0,
    });
    const createPrefilledTeamStats = () => {
        const statsMap = new Map<string, any>();

        for (const scopedUser of allScopedUsers) {
            if (scopedUser.role === "supervisor" && !statsMap.has(scopedUser.id)) {
                statsMap.set(scopedUser.id, createEmptyTeamStats(scopedUser.id, scopedUser.name));
            }
        }

        for (const scopedUser of allScopedUsers) {
            if (scopedUser.role !== "sales") {
                continue;
            }

            const supervisorId = scopedUser.supervisorId || "unassigned_sup";
            if (!statsMap.has(supervisorId)) {
                statsMap.set(
                    supervisorId,
                    createEmptyTeamStats(
                        supervisorId,
                        supervisorNameMap.get(supervisorId) ||
                            (supervisorId === "unassigned_sup" ? "Unassigned Supervisor" : "Unknown Supervisor")
                    )
                );
            }

            statsMap.get(supervisorId)!.salesMap.set(scopedUser.id, createEmptySalesStats(scopedUser.id, scopedUser.name));
        }

        return statsMap;
    };
    const incrementTeamStatsFromLead = (
        statsMap: Map<string, any>,
        item: LeadRow & { appointmentTag: string }
    ) => {
        const supervisorId = item.supervisorId || "unassigned_sup";
        const supervisorName = supervisorNameMap.get(supervisorId) || "Unassigned Supervisor";
        const salesId = item.assignedTo || "unassigned_sales";
        const salesName = item.assignedUserName || "Unassigned Sales";

        if (!statsMap.has(supervisorId)) {
            statsMap.set(supervisorId, createEmptyTeamStats(supervisorId, supervisorName));
        }

        const stats = statsMap.get(supervisorId)!;
        if (!stats.salesMap.has(salesId)) {
            stats.salesMap.set(salesId, createEmptySalesStats(salesId, salesName));
        }

        const salesStats = stats.salesMap.get(salesId)!;
        stats.prospek += 1;
        salesStats.prospek += 1;

        const isHold = item.flowStatus === "hold";
        const isSkip = item.salesStatus === "skip";
        const isSurvey = item.appointmentTag === "sudah_survey";
        const isMauSurvey = item.appointmentTag === "mau_survey";
        const isHot = item.salesStatus === "hot";
        const isPotensi = item.salesStatus === "hot" || item.salesStatus === "warm";
        const resultStatus = toLowerTrimmed(item.resultStatus);
        const isReserve = resultStatus === "reserve";
        const isOnProcess = resultStatus === "on_process";
        const isFullBook = resultStatus === "full_book";
        const isAkad = resultStatus === "akad";
        const isCancel = isCancelResultStatus(resultStatus);

        if (isAkad) {
            stats.akad += 1;
            salesStats.akad += 1;
        } else if (isCancel) {
            stats.cancel += 1;
            salesStats.cancel += 1;
            const reason = item.rejectedReason || "Lainnya";
            stats.cancelReasons[reason] = (stats.cancelReasons[reason] || 0) + 1;
        } else if (isHold) {
            stats.hold += 1;
            salesStats.hold += 1;
        } else if (isSkip) {
            stats.skip += 1;
            salesStats.skip += 1;
        } else {
            stats.ongoing += 1;
            salesStats.ongoing += 1;
        }

        if (isSurvey) {
            stats.survey += 1;
            salesStats.survey += 1;
        }
        if (isMauSurvey) {
            stats.mauSurvey += 1;
            salesStats.mauSurvey += 1;
        }
        if (isHot) {
            stats.hot += 1;
            salesStats.hot += 1;
            if (item.validated) {
                stats.hotValidated += 1;
                salesStats.hotValidated += 1;
            }
        }
        if (isPotensi) {
            stats.potensi += 1;
            salesStats.potensi += 1;
        }
        if (isReserve) {
            stats.reserve += 1;
            salesStats.reserve += 1;
        }
        if (isOnProcess) {
            stats.onProcess += 1;
            salesStats.onProcess += 1;
        }
        if (isFullBook) {
            stats.fullBook += 1;
            salesStats.fullBook += 1;
        }

        return {
            isAkad,
            isCancel,
            isFullBook,
            isHot,
            isHotValidated: isHot && item.validated,
            isMauSurvey,
            isPotensi,
            isSurvey,
        };
    };
    const buildTeamList = (statsMap: Map<string, any>) => Array.from(statsMap.values()).map(t => {
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
            hotValidated: t.hotValidated,
            potensi: t.potensi,
            cancelReasons: t.cancelReasons,
            prospectRate: toPercent((t.hot || 0) + (t.mauSurvey || 0), t.prospek),
            surveyRate: toPercent(t.survey, t.prospek),
            closingRate: toPercent(t.fullBook, t.prospek),
            conversionRate: toPercent(t.akad, t.survey || t.prospek),
            sales: salesList
        };
    }).sort((a, b) => b.ongoing - a.ongoing);
    const buildTeamPerformanceSnapshot = (items: Array<LeadRow & { appointmentTag: string }>) => {
        const statsMap = createPrefilledTeamStats();
        const totals = {
            totalClosing: 0,
            totalFullBook: 0,
            totalPotensi: 0,
            totalBatal: 0,
            totalMauSurvey: 0,
            totalHot: 0,
            totalHotValidated: 0,
        };

        for (const item of items) {
            const flags = incrementTeamStatsFromLead(statsMap, item);
            if (flags.isAkad) totals.totalClosing += 1;
            if (flags.isCancel) totals.totalBatal += 1;
            if (flags.isFullBook) totals.totalFullBook += 1;
            if (flags.isHot) totals.totalHot += 1;
            if (flags.isHotValidated) totals.totalHotValidated += 1;
            if (flags.isMauSurvey) totals.totalMauSurvey += 1;
            if (flags.isPotensi) totals.totalPotensi += 1;
        }

        const sourceTotalLeads = items.length;
        const sourceSurveyedLeads = items.filter((item) => item.appointmentTag === "sudah_survey").length;

        return {
            totalProspek: sourceTotalLeads,
            totalLeads: sourceTotalLeads,
            totalSurvey: sourceSurveyedLeads,
            totalMauSurvey: totals.totalMauSurvey,
            totalHot: totals.totalHot,
            totalHotValidated: totals.totalHotValidated,
            totalFullBook: totals.totalFullBook,
            totalPotensi: totals.totalPotensi,
            totalBatal: totals.totalBatal,
            totalClosing: totals.totalFullBook,
            prospectRate: toPercent(totals.totalHot + totals.totalMauSurvey, sourceTotalLeads),
            surveyRate: toPercent(sourceSurveyedLeads, sourceTotalLeads),
            closingRate: toPercent(totals.totalFullBook, sourceTotalLeads),
            conversionRate: toPercent(totals.totalClosing, sourceSurveyedLeads || sourceTotalLeads),
            teams: buildTeamList(statsMap),
        };
    };

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
                    hotValidated: 0,
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
                    hotValidated: 0,
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
                hotValidated: 0,
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
                hotValidated: 0,
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
                hotValidated: 0,
                potensi: 0,
                batal: 0,
                conversionRate: 0
            });
        }
        const sStats = stats.salesMap.get(salesId)!;

        // Source Breakdown
        const src = resolveSourceLabel(item.source);
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
            const sourceLabel = resolveSourceLabel(item.source);

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
            incrementStatusCount(scopeBucket, "l4", resolveDatabaseResultStatusKey(item.resultStatus), "none");
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
        const isCancel = isCancelResultStatus(rStatus);

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
                stats.hotValidated += 1; sStats.hotValidated += 1;
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

    const teamList = buildTeamList(teamStats);

    const sourceClientIds = scope?.clientId
        ? [scope.clientId]
        : Array.from(
            new Set(
                decoratedLeads
                    .map((item) => item.clientId)
                    .filter((value): value is string => Boolean(value))
            )
        );
    const configuredLeadSources = (
        await Promise.all(sourceClientIds.map((clientId) => leadSourcesService.listLeadSources(clientId)))
    ).flat();
    const sourceOptionMap = new Map<string, string>();
    const sourceCountByCompareKey = new Map<string, number>();

    for (const [source, count] of sourceCounts.entries()) {
        const compareKey = toLowerTrimmed(source);
        sourceCountByCompareKey.set(compareKey, (sourceCountByCompareKey.get(compareKey) || 0) + count);
    }

    for (const item of configuredLeadSources) {
        const sourceValue = resolveSourceLabel(item.value);
        sourceOptionMap.set(toLowerTrimmed(sourceValue), sourceValue);
    }

    for (const source of sourceCounts.keys()) {
        const sourceValue = resolveSourceLabel(source);
        const compareKey = toLowerTrimmed(sourceValue);
        if (!sourceOptionMap.has(compareKey)) {
            sourceOptionMap.set(compareKey, sourceValue);
        }
    }

    const sourceOptionValues = Array.from(sourceOptionMap.values())
        .sort((a, b) => a.localeCompare(b));
    const teamPerformanceSourceBreakdown = sourceOptionValues.map((source) => {
        const count = sourceCountByCompareKey.get(toLowerTrimmed(source)) || 0;
        return {
            source,
            count,
            percentage: toPercent(count, totalLeads),
        };
    });

    const sourceBreakdown = Array.from(sourceCounts.entries()).map(([source, count]) => ({
        source,
        count,
        percentage: toPercent(count, totalLeads)
    })).sort((a, b) => b.count - a.count);
    const lineChart = buildLineChartData(decoratedLeads, normalizedDateRange);

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
        cancelReasonBreakdown: cancelReasonItems,
        unitOptions,
    };

    const teamPerformanceSourceScopes = Object.fromEntries(
        teamPerformanceSourceBreakdown.map((item) => {
            const sourceKey = `source:${item.source}`;
            const sourceLeads = decoratedLeads.filter((leadItem) => (
                toLowerTrimmed(resolveSourceLabel(leadItem.source)) === toLowerTrimmed(item.source)
            ));
            return [sourceKey, buildTeamPerformanceSnapshot(sourceLeads)];
        })
    );

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
        teams: teamList,
        sourceBreakdown: teamPerformanceSourceBreakdown,
        sourceOptions: [
            { key: "all", label: "Semua Source", count: totalLeads },
            ...teamPerformanceSourceBreakdown.map((item) => ({
                key: `source:${item.source}`,
                label: item.source,
                count: item.count,
            })),
        ],
        sourceScopes: teamPerformanceSourceScopes,
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
        dailySalesReport,
        transactionRecap,
        teamPerformance,
        databaseControl,
        lineChart,
    };
}
