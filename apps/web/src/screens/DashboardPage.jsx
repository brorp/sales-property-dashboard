'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getRejectedReasonLabel, getSalesStatusLabel, getResultStatusLabel } from '../constants/crm';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';

const STATUS_COLOR_MAP = {
    hot: 'var(--hot)',
    warm: 'var(--warm)',
    cold: 'var(--cold)',
    error: '#F97316',
    no_response: '#94A3B8',
    skip: 'var(--purple)',
    unfilled: '#64748B',
};

const EMPTY_DATE_RANGE = {
    dateFrom: '',
    dateTo: '',
};

const DEFAULT_ANALYTICS = {
    hierarchySummary: null,
    surveyRatio: { totalLeads: 0, surveyedLeads: 0, ratioPercent: 0 },
    flowOverview: { open: 0, assigned: 0 },
    perAgentSurveyRatio: [],
    statusPie: { total: 0, items: [] },
    domicileBars: [],
    ongoingAppointments: [],
    resultRecap: { total: 0, items: [], cancelReasons: { total: 0, items: [] } },
    holdLeads: [],
};

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const QUICK_RANGES = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'last7', label: '7 Hari' },
    { key: 'last30', label: '30 Hari' },
    { key: 'thisMonth', label: 'Bulan Ini' },
];

function toConicGradient(items, total, colorFor, emptyColor = 'var(--bg-input)') {
    if (!total || !items.length) {
        return `conic-gradient(${emptyColor} 0deg 360deg)`;
    }

    let current = 0;
    const segments = [];

    for (const item of items) {
        if (!item.count) {
            continue;
        }
        const value = (item.count / total) * 360;
        const next = current + value;
        segments.push(`${colorFor(item)} ${current}deg ${next}deg`);
        current = next;
    }

    if (!segments.length) {
        return `conic-gradient(${emptyColor} 0deg 360deg)`;
    }

    if (current < 360) {
        segments.push(`${emptyColor} ${current}deg 360deg`);
    }

    return `conic-gradient(${segments.join(', ')})`;
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseDateInput(value) {
    if (!value) {
        return null;
    }

    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    const next = new Date(year, month - 1, day);
    return Number.isNaN(next.getTime()) ? null : next;
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeDateRange(range) {
    const dateFrom = range?.dateFrom || '';
    const dateTo = range?.dateTo || '';

    if (dateFrom && dateTo && dateFrom > dateTo) {
        return {
            dateFrom: dateTo,
            dateTo: dateFrom,
        };
    }

    return {
        dateFrom,
        dateTo,
    };
}

function isSameDay(a, b) {
    if (!a || !b) {
        return false;
    }

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function isDateBetween(date, start, end) {
    if (!date || !start || !end) {
        return false;
    }

    return date.getTime() > start.getTime() && date.getTime() < end.getTime();
}

function buildMonthDays(monthDate) {
    const firstDayOfMonth = startOfMonth(monthDate);
    const weekDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstDayOfMonth);
    gridStart.setDate(firstDayOfMonth.getDate() - weekDayOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const next = new Date(gridStart);
        next.setDate(gridStart.getDate() + index);
        return next;
    });
}

function formatMonthLabel(date) {
    return new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
    }).format(date);
}

function formatRangeButtonLabel(range) {
    if (!range.dateFrom && !range.dateTo) {
        return 'Filter Tanggal';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
    });

    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) {
        return 'Filter Tanggal';
    }

    return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatRangeSummary(range) {
    if (!range.dateFrom && !range.dateTo) {
        return 'Semua data lead masuk';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) {
        return 'Semua data lead masuk';
    }

    return `Lead masuk ${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatDatePreview(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
        return 'Pilih tanggal';
    }

    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
}

function buildDashboardQuery(range) {
    const params = new URLSearchParams();
    if (range?.dateFrom) {
        params.set('dateFrom', range.dateFrom);
    }
    if (range?.dateTo) {
        params.set('dateTo', range.dateTo);
    }

    const query = params.toString();
    return query ? `?${query}` : '';
}

function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);

    if (key === 'today') {
        return { dateFrom: end, dateTo: end };
    }

    if (key === 'last7') {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return {
            dateFrom: formatDateInput(start),
            dateTo: end,
        };
    }

    if (key === 'last30') {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return {
            dateFrom: formatDateInput(start),
            dateTo: end,
        };
    }

    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
        dateFrom: formatDateInput(start),
        dateTo: end,
    };
}

function formatClientNameFromSlug(slug) {
    if (!slug) {
        return '';
    }

    return String(slug)
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export default function DashboardPage() {
    const { user, isAdmin, getRoleLabel } = useAuth();
    const { dashboardAnalytics, refreshAll } = useLeads();
    const router = useRouter();
    const filterRef = useRef(null);

    const [refreshing, setRefreshing] = useState(false);
    const [filterLoading, setFilterLoading] = useState(false);
    const [pageAnalytics, setPageAnalytics] = useState(null);
    const [dashboardError, setDashboardError] = useState('');
    const [holdActionLoadingId, setHoldActionLoadingId] = useState('');
    const [holdActionMessage, setHoldActionMessage] = useState('');
    const [holdActionError, setHoldActionError] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [appliedDateRange, setAppliedDateRange] = useState(EMPTY_DATE_RANGE);
    const [draftDateRange, setDraftDateRange] = useState(EMPTY_DATE_RANGE);
    const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

    const showDateFilter = user?.role === 'client_admin';
    const hasActiveDateFilter = Boolean(appliedDateRange.dateFrom || appliedDateRange.dateTo);
    const showHierarchyOverview =
        user?.role === 'client_admin' || user?.role === 'root_admin';

    const analytics = useMemo(() => {
        return pageAnalytics ?? dashboardAnalytics ?? DEFAULT_ANALYTICS;
    }, [dashboardAnalytics, pageAnalytics]);

    const dashboardStats = useMemo(() => {
        const closingCount = analytics.resultRecap.items.find((item) => item.key === 'closing')?.count || 0;

        return {
            total: analytics.statusPie.total || analytics.surveyRatio.totalLeads || 0,
            open: analytics.flowOverview.open || 0,
            assigned: analytics.flowOverview.assigned || 0,
            closing: closingCount,
        };
    }, [analytics.flowOverview.assigned, analytics.flowOverview.open, analytics.resultRecap.items, analytics.statusPie.total, analytics.surveyRatio.totalLeads]);

    const statusPieGradient = useMemo(() => {
        return toConicGradient(
            analytics.statusPie.items,
            analytics.statusPie.total,
            (item) => STATUS_COLOR_MAP[item.key] || 'var(--primary-light)'
        );
    }, [analytics.statusPie.items, analytics.statusPie.total]);

    const dashboardTitle = useMemo(() => {
        const shortRoleLabel =
            user?.role === 'client_admin'
                ? 'Admin'
                : user?.role === 'root_admin'
                    ? 'Root Admin'
                    : getRoleLabel(user?.role);

        const clientName =
            analytics.hierarchySummary?.client?.name ||
            formatClientNameFromSlug(user?.clientSlug) ||
            '';

        if (clientName && user?.role && user.role !== 'root_admin') {
            return `${clientName} ${shortRoleLabel} Dashboard`;
        }

        return `${shortRoleLabel} Dashboard`;
    }, [analytics.hierarchySummary?.client?.name, getRoleLabel, user?.clientSlug, user?.role]);

    const draftStartDate = parseDateInput(draftDateRange.dateFrom);
    const draftEndDate = parseDateInput(draftDateRange.dateTo);

    const loadDashboardAnalytics = useCallback(async (range = EMPTY_DATE_RANGE) => {
        if (!user) {
            setPageAnalytics(null);
            return null;
        }

        const data = await apiRequest(`/api/dashboard/home-analytics${buildDashboardQuery(range)}`, { user });
        setDashboardError('');
        setPageAnalytics(data || DEFAULT_ANALYTICS);
        return data || DEFAULT_ANALYTICS;
    }, [user]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setDashboardError('');

        try {
            await refreshAll();
            await loadDashboardAnalytics(appliedDateRange);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setRefreshing(false);
        }
    };

    const handleStartHeldLead = async (leadId) => {
        setHoldActionLoadingId(leadId);
        setHoldActionMessage('');
        setHoldActionError('');

        try {
            await apiRequest(`/api/distribution/leads/${leadId}/start`, {
                method: 'POST',
                user,
            });
            await refreshAll();
            await loadDashboardAnalytics(appliedDateRange);
            setHoldActionMessage('Distribusi untuk lead hold berhasil dimulai.');
        } catch (err) {
            setHoldActionError(err instanceof Error ? err.message : 'Gagal memulai distribusi lead hold');
        } finally {
            setHoldActionLoadingId('');
        }
    };

    const openDateFilter = () => {
        const nextDraft = normalizeDateRange(appliedDateRange);
        setDraftDateRange(nextDraft);
        setCalendarMonth(startOfMonth(parseDateInput(nextDraft.dateFrom) || new Date()));
        setFilterOpen(true);
    };

    const handleDateSelection = (date) => {
        const pickedDate = formatDateInput(date);

        setDraftDateRange((prev) => {
            const start = parseDateInput(prev.dateFrom);
            const end = parseDateInput(prev.dateTo);

            if (!start || (start && end)) {
                return {
                    dateFrom: pickedDate,
                    dateTo: '',
                };
            }

            if (date.getTime() < start.getTime()) {
                return {
                    dateFrom: pickedDate,
                    dateTo: prev.dateFrom,
                };
            }

            return {
                dateFrom: prev.dateFrom,
                dateTo: pickedDate,
            };
        });
    };

    const handleQuickRange = (key) => {
        const nextRange = getPresetRange(key);
        setDraftDateRange(nextRange);
        setCalendarMonth(startOfMonth(parseDateInput(nextRange.dateFrom) || new Date()));
    };

    const handleApplyDateFilter = async () => {
        const nextRange = normalizeDateRange({
            dateFrom: draftDateRange.dateFrom,
            dateTo: draftDateRange.dateTo || draftDateRange.dateFrom,
        });

        setFilterLoading(true);
        setDashboardError('');

        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setFilterOpen(false);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleClearDateFilter = async () => {
        const nextRange = { ...EMPTY_DATE_RANGE };

        setFilterLoading(true);
        setDashboardError('');

        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setFilterOpen(false);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    useEffect(() => {
        if (!filterOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) {
                setFilterOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [filterOpen]);

    useEffect(() => {
        if (!user) {
            setPageAnalytics(null);
            setAppliedDateRange({ ...EMPTY_DATE_RANGE });
            setDraftDateRange({ ...EMPTY_DATE_RANGE });
            setFilterOpen(false);
        }
    }, [user]);

    return (
        <div className="page-container">
            <Header
                title={dashboardTitle}
                rightAction={(
                    <div className="dashboard-header-actions">
                        {showDateFilter ? (
                            <div className="dashboard-filter-shell" ref={filterRef}>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${hasActiveDateFilter ? 'btn-primary' : 'btn-secondary'} dashboard-filter-trigger`}
                                    onClick={() => {
                                        if (filterOpen) {
                                            setFilterOpen(false);
                                            return;
                                        }
                                        openDateFilter();
                                    }}
                                >
                                    {formatRangeButtonLabel(appliedDateRange)}
                                </button>

                                {filterOpen ? (
                                    <div className="dashboard-filter-popover">
                                        <div className="dashboard-filter-popover-head">
                                            <div>
                                                <h3>Pilih Rentang Tanggal</h3>
                                                <p>Filter semua analytics home berdasarkan lead masuk.</p>
                                            </div>
                                            <button
                                                type="button"
                                                className="dashboard-filter-close"
                                                onClick={() => setFilterOpen(false)}
                                                aria-label="Tutup filter"
                                            >
                                                ×
                                            </button>
                                        </div>

                                        <div className="dashboard-filter-preview">
                                            <div className="dashboard-filter-preview-card">
                                                <span>Mulai</span>
                                                <strong>{formatDatePreview(draftDateRange.dateFrom)}</strong>
                                            </div>
                                            <div className="dashboard-filter-preview-card">
                                                <span>Sampai</span>
                                                <strong>{formatDatePreview(draftDateRange.dateTo || draftDateRange.dateFrom)}</strong>
                                            </div>
                                        </div>

                                        <div className="dashboard-filter-quick">
                                            {QUICK_RANGES.map((preset) => (
                                                <button
                                                    key={preset.key}
                                                    type="button"
                                                    className="dashboard-quick-pill"
                                                    onClick={() => handleQuickRange(preset.key)}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="dashboard-calendar-head">
                                            <button
                                                type="button"
                                                className="dashboard-calendar-nav"
                                                onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
                                                aria-label="Bulan sebelumnya"
                                            >
                                                ←
                                            </button>
                                            <div className="dashboard-calendar-head-label">Calendar Range</div>
                                            <button
                                                type="button"
                                                className="dashboard-calendar-nav"
                                                onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
                                                aria-label="Bulan berikutnya"
                                            >
                                                →
                                            </button>
                                        </div>

                                        <div className="dashboard-calendar-grid">
                                            {[0, 1].map((offset) => {
                                                const monthDate = addMonths(calendarMonth, offset);
                                                const days = buildMonthDays(monthDate);

                                                return (
                                                    <div key={formatMonthLabel(monthDate)} className="dashboard-calendar-month">
                                                        <div className="dashboard-calendar-month-title">{formatMonthLabel(monthDate)}</div>
                                                        <div className="dashboard-calendar-weekdays">
                                                            {DAY_LABELS.map((dayLabel) => (
                                                                <span key={dayLabel}>{dayLabel}</span>
                                                            ))}
                                                        </div>
                                                        <div className="dashboard-calendar-days">
                                                            {days.map((day) => {
                                                                const isOutsideMonth = day.getMonth() !== monthDate.getMonth();
                                                                const isStart = isSameDay(day, draftStartDate);
                                                                const isEnd = isSameDay(day, draftEndDate);
                                                                const isInRange = isDateBetween(day, draftStartDate, draftEndDate);
                                                                const isToday = isSameDay(day, new Date());

                                                                return (
                                                                    <button
                                                                        key={`${formatMonthLabel(monthDate)}-${formatDateInput(day)}`}
                                                                        type="button"
                                                                        className={[
                                                                            'dashboard-calendar-day',
                                                                            isOutsideMonth ? 'is-outside' : '',
                                                                            isToday ? 'is-today' : '',
                                                                            isInRange ? 'is-in-range' : '',
                                                                            isStart ? 'is-start' : '',
                                                                            isEnd ? 'is-end' : '',
                                                                        ].filter(Boolean).join(' ')}
                                                                        onClick={() => handleDateSelection(day)}
                                                                    >
                                                                        {day.getDate()}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="dashboard-filter-actions">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => void handleClearDateFilter()}
                                                disabled={filterLoading}
                                            >
                                                Reset
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-primary"
                                                onClick={() => void handleApplyDateFilter()}
                                                disabled={filterLoading || !draftDateRange.dateFrom}
                                            >
                                                {filterLoading ? 'Loading...' : 'Apply'}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                )}
            />

            {showDateFilter ? (
                <div className="dashboard-filter-summary">
                    <span className="badge badge-purple">{hasActiveDateFilter ? 'Range Active' : 'All Data'}</span>
                    <span>{formatRangeSummary(appliedDateRange)}</span>
                </div>
            ) : null}

            {dashboardError ? <div className="settings-error">{dashboardError}</div> : null}

            {showHierarchyOverview && analytics.hierarchySummary ? (
                <section className="dash-section">
                    <h2 className="section-title">{analytics.hierarchySummary.roleLabel} Overview</h2>
                    <div className="stats-grid">
                        {analytics.hierarchySummary.counts?.clients !== undefined ? (
                            <div className="stat-card stat-total">
                                <span className="stat-label">Clients</span>
                                <span className="stat-value">{analytics.hierarchySummary.counts.clients}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.clientAdmins !== undefined ? (
                            <div className="stat-card stat-total">
                                <span className="stat-label">Client Admins</span>
                                <span className="stat-value">{analytics.hierarchySummary.counts.clientAdmins}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.supervisors !== undefined ? (
                            <div className="stat-card stat-hot">
                                <span className="stat-label">Supervisors</span>
                                <span className="stat-value">{analytics.hierarchySummary.counts.supervisors}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.sales !== undefined ? (
                            <div className="stat-card stat-pending">
                                <span className="stat-label">Sales</span>
                                <span className="stat-value">{analytics.hierarchySummary.counts.sales}</span>
                            </div>
                        ) : null}
                    </div>

                    {Array.isArray(analytics.hierarchySummary.clients) && analytics.hierarchySummary.clients.length > 0 ? (
                        <div className="card-list">
                            {analytics.hierarchySummary.clients.map((item) => (
                                <div key={item.id} className="card">
                                    <div className="lead-row-top">
                                        <div className="lead-row-name">{item.name}</div>
                                        <span className={`badge ${item.isActive ? 'badge-success' : 'badge-danger'}`}>
                                            {item.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="lead-row-meta">
                                        <span>Client Admin: {item.clientAdmins}</span>
                                        <span>Supervisor: {item.supervisors}</span>
                                        <span>Sales: {item.sales}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {Array.isArray(analytics.hierarchySummary.supervisors) && analytics.hierarchySummary.supervisors.length > 0 ? (
                        <div className="card-list">
                            {analytics.hierarchySummary.supervisors.map((item) => (
                                <div
                                    key={item.id}
                                    className="card card-clickable"
                                    onClick={() => router.push(`/team/${item.id}`)}
                                >
                                    <div className="lead-row-top">
                                        <div className="lead-row-name">{item.name}</div>
                                        <span className="badge badge-purple">{item.salesCount} Sales</span>
                                    </div>
                                    <div className="lead-row-meta">
                                        <span>{item.email}</span>
                                        <span>Lihat detail supervisor</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {Array.isArray(analytics.hierarchySummary.sales) && analytics.hierarchySummary.sales.length > 0 ? (
                        <div className="card-list">
                            {analytics.hierarchySummary.sales.map((item) => (
                                <div
                                    key={item.id}
                                    className="card card-clickable"
                                    onClick={() => router.push(`/team/${item.id}`)}
                                >
                                    <div className="lead-row-name">{item.name}</div>
                                    <div className="lead-row-meta">
                                        <span>{item.email}</span>
                                        <span>Lihat detail sales</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </section>
            ) : null}

            {isAdmin && analytics.holdLeads.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Leads Hold (Outside Operational Hours)</h2>
                    {holdActionError ? <div className="settings-error">{holdActionError}</div> : null}
                    {holdActionMessage ? <div className="settings-success">{holdActionMessage}</div> : null}
                    <div className="card-list">
                        {analytics.holdLeads.map((item) => (
                            <div key={item.id} className="card hold-lead-card">
                                <div className="lead-row-top">
                                    <div className="lead-row-name">{item.name}</div>
                                    <span className="badge badge-purple">Hold</span>
                                </div>
                                <div className="lead-row-meta">
                                    <span>📱 {item.phone}</span>
                                    <span>📣 {item.source}</span>
                                </div>
                                <div className="lead-row-meta">
                                    <span>Masuk: {new Date(item.createdAt).toLocaleString('id-ID')}</span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-full hold-lead-action"
                                    onClick={() => void handleStartHeldLead(item.id)}
                                    disabled={holdActionLoadingId === item.id}
                                >
                                    {holdActionLoadingId === item.id ? 'Starting...' : 'Start Distribution'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <span className="stat-label">Total Leads</span>
                    <span className="stat-value">{dashboardStats.total}</span>
                </div>
                <div className="stat-card stat-pending">
                    <span className="stat-label">Open</span>
                    <span className="stat-value" style={{ color: 'var(--warm)' }}>{dashboardStats.open}</span>
                </div>
                <div className="stat-card stat-hot">
                    <span className="stat-label">Assigned</span>
                    <span className="stat-value" style={{ color: 'var(--primary-light)' }}>{dashboardStats.assigned}</span>
                </div>
                <div className="stat-card stat-closed">
                    <span className="stat-label">Closing</span>
                    <span className="stat-value" style={{ color: 'var(--success)' }}>{dashboardStats.closing}</span>
                </div>
            </div>

            <section className="dash-section">
                <div className="card">
                    <div className="section-title">Survey Rate Ratio</div>
                    <div className="lead-row-meta" style={{ marginBottom: 8 }}>
                        <span>Total Leads: {analytics.surveyRatio.totalLeads}</span>
                        <span>Sudah Survey: {analytics.surveyRatio.surveyedLeads}</span>
                    </div>
                    <div className="chart-track" style={{ marginBottom: 8 }}>
                        <div className="chart-fill" style={{ width: `${Math.max(analytics.surveyRatio.ratioPercent, analytics.surveyRatio.surveyedLeads > 0 ? 2 : 0)}%`, background: 'linear-gradient(90deg, var(--primary), var(--success))' }} />
                    </div>
                    <div className="lead-row-meta">
                        <span>{isAdmin ? 'Overall Ratio' : 'Agent Ratio'}</span>
                        <strong>{analytics.surveyRatio.ratioPercent}%</strong>
                    </div>
                </div>
            </section>

            {isAdmin && analytics.perAgentSurveyRatio.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Survey Ratio per Agent</h2>
                    <div className="card agent-pie-grid">
                        {analytics.perAgentSurveyRatio.map((item) => (
                            <div key={item.salesId} className="agent-pie-card">
                                <div className="mini-pie" style={{ background: `conic-gradient(var(--success) 0deg ${(item.ratioPercent / 100) * 360}deg, var(--bg-input) ${(item.ratioPercent / 100) * 360}deg 360deg)` }}>
                                    <div className="mini-pie-center">{item.ratioPercent}%</div>
                                </div>
                                <div className="agent-pie-meta">
                                    <div className="agent-pie-name">{item.salesName}</div>
                                    <div className="agent-pie-ratio">{item.surveyedLeads}/{item.totalLeads} surveyed</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {analytics.statusPie.items.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Sales Status Breakdown</h2>
                    <div className="card">
                        <div className="pie-layout">
                            <div className="pie-chart" style={{ background: statusPieGradient }}>
                                <div className="pie-chart-center">
                                    <strong>{analytics.statusPie.total}</strong>
                                    <span>Total</span>
                                </div>
                            </div>
                            <div className="pie-legend">
                                {analytics.statusPie.items.map((item) => (
                                    <div key={item.key} className="pie-legend-row">
                                        <span className="pie-legend-left">
                                            <span className="pie-dot" style={{ background: STATUS_COLOR_MAP[item.key] || 'var(--primary-light)' }} />
                                            <span>{getSalesStatusLabel(item.key)}</span>
                                        </span>
                                        <span>{item.percentage}% ({item.count})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {isAdmin ? (
                <section className="dash-section">
                    <h2 className="section-title">Domisili Leads</h2>
                    <div className="card chart-card">
                        {analytics.domicileBars.length === 0 ? (
                            <div className="empty-desc">Belum ada data domisili.</div>
                        ) : analytics.domicileBars.map((item) => (
                            <div key={item.city} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{item.city}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className="chart-fill"
                                        style={{
                                            width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                            background: 'var(--warm)',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="dash-section">
                <h2 className="section-title">Ongoing Appointment (Mau Survey)</h2>
                <div className="card-list">
                    {analytics.ongoingAppointments.length === 0 ? (
                        <div className="card">Belum ada appointment yang mau survey.</div>
                    ) : analytics.ongoingAppointments.map((item) => (
                        <div key={item.id} className="card card-clickable appt-card" onClick={() => router.push(`/leads/${item.leadId}`)}>
                            <div className="lead-row-top">
                                <div className="lead-row-name">{item.leadName}</div>
                                <span className="badge badge-warm">Mau Survey</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📅 {item.date}</span>
                                <span>🕐 {item.time}</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📍 {item.location}</span>
                                {isAdmin ? <span>👤 {item.salesName || '-'}</span> : null}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="dash-section">
                <h2 className="section-title">Result Status Recap</h2>
                <div className="card chart-card">
                    {analytics.resultRecap.items.map((item) => (
                        <div key={item.key} className="chart-row">
                            <div className="chart-row-head">
                                <span>{getResultStatusLabel(item.key)}</span>
                                <span>{item.percentage}% ({item.count})</span>
                            </div>
                            <div className="chart-track">
                                <div
                                    className="chart-fill"
                                    style={{
                                        width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                        background: item.key === 'closing' ? 'var(--success)' : item.key === 'batal' ? 'var(--danger)' : 'var(--primary)',
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {analytics.resultRecap.cancelReasons.total > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Alasan Batal</h2>
                    <div className="card chart-card">
                        {analytics.resultRecap.cancelReasons.items.map((item) => (
                            <div key={item.key} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{getRejectedReasonLabel(item.key)}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className="chart-fill"
                                        style={{
                                            width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                            background: 'var(--danger)',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
