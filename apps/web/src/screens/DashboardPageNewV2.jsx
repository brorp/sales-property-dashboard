'use client';

import './DashboardPage.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';
import DateRangePicker from '../components/DateRangePicker';
import { usePagePolling } from '../hooks/usePagePolling';
import DailySalesReportSection from './dashboard-sections/DailySalesReportSection';
import LineChartSection from './dashboard-sections/LineChartSection';

const EMPTY_DATE_RANGE = { dateFrom: '', dateTo: '' };

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
    transactionRecap: null,
    teamPerformance: null,
    databaseControl: null,
    lineChart: null,
    dailySalesReport: null,
};

const QUICK_RANGES = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'last7', label: '7 Hari' },
    { key: 'last30', label: '30 Hari' },
    { key: 'last90', label: '90 Hari' },
    { key: 'thisMonth', label: 'Bulan Ini' },
];

const STATUS_COLORS = {
    hot: '#EF4444',
    warm: '#F97316',
    cold: '#0EA5E9',
    skip: '#94A3B8',
    error: '#DC2626',
    no_response: '#64748B',
    unfilled: '#CBD5E1',
};

const RESULT_COLORS = {
    reserve: '#0EA5E9',
    on_process: '#1E3A5F',
    full_book: '#7C3AED',
    akad: '#22C55E',
    cancel_transaksi: '#EF4444',
    cancel_minat: '#F97316',
};

function buildConicGradient(items) {
    const total = items.reduce((s, i) => s + (i.count || 0), 0);
    if (total <= 0) return '#F1F5F9';
    let cursor = 0;
    const segments = items
        .filter((i) => i.count > 0)
        .map((i) => {
            const start = (cursor / total) * 360;
            cursor += i.count;
            const end = (cursor / total) * 360;
            return `${i.color} ${start}deg ${end}deg`;
        });
    return `conic-gradient(${segments.join(', ')})`;
}

function DonutChart({ items, centerLabel, centerValue }) {
    const total = items.reduce((s, i) => s + (i.count || 0), 0);
    return (
        <div className="dash-donut-wrap">
            <div className="dash-donut-col">
                <div className="dash-donut" style={{ background: buildConicGradient(items) }}>
                    <div className="dash-donut-hole">
                        <span className="dash-donut-hole-label">{centerLabel}</span>
                        <strong className="dash-donut-hole-value">{centerValue}</strong>
                    </div>
                </div>
            </div>
            <div className="dash-donut-legend">
                {items.map((item) => {
                    const pct = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                    return (
                        <div key={item.key || item.label} className="dash-donut-row">
                            <span className="dash-donut-dot" style={{ background: item.color }} />
                            <span className="dash-donut-row-label">{item.label}</span>
                            <strong className="dash-donut-row-count">{item.count}</strong>
                            <span className="dash-donut-row-pct">{pct}%</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MiniBarList({ items }) {
    const max = Math.max(1, ...items.map((i) => i.count || 0));
    return (
        <div className="dash-bar-list">
            {items.map((item, idx) => {
                const val = item.count || 0;
                const pct = Math.round((val / max) * 100);
                const label = item.label || item.source || item.key || '-';
                return (
                    <div key={idx} className="dash-bar-item">
                        <div className="dash-bar-header">
                            <span className="dash-bar-label">{label}</span>
                            <span className="dash-bar-value">
                                <strong>{val}</strong>
                                {item.percentage !== undefined ? (
                                    <span className="dash-bar-pct">{item.percentage}%</span>
                                ) : null}
                            </span>
                        </div>
                        <div className="dash-bar-track">
                            <div className="dash-bar-fill" style={{ width: `${Math.max(4, pct)}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function parseDateInput(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;
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
    if (dateFrom && dateTo && dateFrom > dateTo) return { dateFrom: dateTo, dateTo: dateFrom };
    return { dateFrom, dateTo };
}

function formatRangeButtonLabel(range) {
    if (!range.dateFrom && !range.dateTo) return 'Custom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Custom';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatRangeSummary(range) {
    if (!range.dateFrom && !range.dateTo) return 'Semua data lead masuk';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Semua data lead masuk';
    return `Lead masuk ${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatReminderDateTime(dateValue, timeValue) {
    if (!dateValue) return '-';
    const safeTime = String(timeValue || '00:00').slice(0, 5);
    const parsed = new Date(`${dateValue}T${safeTime}:00`);
    if (Number.isNaN(parsed.getTime())) return `${dateValue} ${safeTime}`;
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function formatSuspensionUntil(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function buildDashboardQuery(range) {
    const params = new URLSearchParams();
    if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
    if (range?.dateTo) params.set('dateTo', range.dateTo);
    const query = params.toString();
    return query ? `?${query}` : '';
}

function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);
    if (key === 'today') return { dateFrom: end, dateTo: end };
    if (key === 'last7') { const s = new Date(today); s.setDate(today.getDate() - 6); return { dateFrom: formatDateInput(s), dateTo: end }; }
    if (key === 'last30') { const s = new Date(today); s.setDate(today.getDate() - 29); return { dateFrom: formatDateInput(s), dateTo: end }; }
    if (key === 'last90') { const s = new Date(today); s.setDate(today.getDate() - 89); return { dateFrom: formatDateInput(s), dateTo: end }; }
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: formatDateInput(s), dateTo: end };
}

function formatClientNameFromSlug(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function fmt(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

export default function DashboardPage() {
    const { user, isAdmin, getRoleLabel } = useAuth();
    const { dashboardAnalytics, refreshAll } = useLeads();
    const router = useRouter();
    const globalFilterRef = useRef(null);

    const [refreshing, setRefreshing] = useState(false);
    const [filterLoading, setFilterLoading] = useState(false);
    const [pageAnalytics, setPageAnalytics] = useState(null);
    const [dashboardError, setDashboardError] = useState('');
    const [holdActionLoadingId, setHoldActionLoadingId] = useState('');
    const [holdActionMessage, setHoldActionMessage] = useState('');
    const [holdActionError, setHoldActionError] = useState('');
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const [appliedDateRange, setAppliedDateRange] = useState(() => getPresetRange('today'));
    const [draftDateRange, setDraftDateRange] = useState(() => getPresetRange('today'));
    const [selectedTeamId, setSelectedTeamId] = useState('all');

    const showDateFilter = Boolean(user);
    const showHierarchyOverview = user?.role === 'root_admin';
    const canUseTeamFilters = user?.role === 'client_admin' || user?.role === 'root_admin';
    const showRoleReminder = user?.role === 'supervisor' || user?.role === 'sales';
    const showDailySalesReport = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const scopedDashboardLabel = user?.role === 'supervisor' ? 'Tim Anda' : user?.role === 'sales' ? 'Data Anda' : 'Semua';

    const analytics = useMemo(() => pageAnalytics ?? dashboardAnalytics ?? DEFAULT_ANALYTICS, [dashboardAnalytics, pageAnalytics]);

    const teamOptions = useMemo(() => {
        const teams = analytics.teamPerformance?.teams || [];
        return teams.map((t) => ({
            id: t.teamId,
            name: t.teamId === 'unassigned_sup' ? 'PIC Agent' : (t.teamName || t.teamId),
        }));
    }, [analytics.teamPerformance]);

    const selectedTeam = useMemo(() => {
        if (selectedTeamId === 'all') return null;
        return analytics.teamPerformance?.teams?.find((t) => t.teamId === selectedTeamId) || null;
    }, [selectedTeamId, analytics.teamPerformance]);

    const dashboardStats = useMemo(() => {
        if (selectedTeam) {
            const txTeam = analytics.transactionRecap?.teams?.find((t) => t.teamId === selectedTeamId);
            return {
                total: selectedTeam.prospek || 0,
                hot: selectedTeam.hot || 0,
                surveyRate: selectedTeam.surveyRate || 0,
                reserve: txTeam?.reserve || 0,
                closing: (txTeam?.akad || 0) + (txTeam?.fullBook || 0),
                cancel: txTeam?.cancel || 0,
            };
        }
        const items = analytics.resultRecap?.items || [];
        const find = (key) => items.find((i) => i.key === key)?.count || 0;
        return {
            total: analytics.statusPie?.total || analytics.surveyRatio?.totalLeads || 0,
            hot: analytics.statusPie?.items?.find((i) => i.key === 'hot')?.count || 0,
            surveyRate: analytics.surveyRatio?.ratioPercent || 0,
            reserve: find('reserve'),
            closing: find('full_book') + find('akad'),
            cancel: find('cancel_transaksi') + find('cancel_minat'),
        };
    }, [analytics, selectedTeam, selectedTeamId]);

    const statusPieItems = useMemo(() => (
        (analytics.statusPie?.items || [])
            .filter((i) => i.count > 0)
            .map((i) => ({ ...i, color: STATUS_COLORS[i.key] || '#94A3B8' }))
    ), [analytics.statusPie]);

    const resultPieItems = useMemo(() => {
        if (selectedTeam) {
            const txTeam = analytics.transactionRecap?.teams?.find((t) => t.teamId === selectedTeamId);
            if (txTeam) {
                return [
                    { key: 'reserve', label: 'Reserve', count: txTeam.reserve || 0 },
                    { key: 'on_process', label: 'On Process', count: txTeam.onProcess || 0 },
                    { key: 'full_book', label: 'Full Book', count: txTeam.fullBook || 0 },
                    { key: 'akad', label: 'Akad', count: txTeam.akad || 0 },
                    { key: 'cancel_transaksi', label: 'Cancel', count: txTeam.cancel || 0 },
                ]
                    .filter((i) => i.count > 0)
                    .map((i) => ({ ...i, color: RESULT_COLORS[i.key] || '#94A3B8' }));
            }
        }
        return (analytics.resultRecap?.items || [])
            .filter((i) => i.count > 0)
            .map((i) => ({ ...i, color: RESULT_COLORS[i.key] || '#94A3B8' }));
    }, [analytics, selectedTeam, selectedTeamId]);

    const sourceBreakdownItems = useMemo(() => (
        (analytics.teamPerformance?.sourceBreakdown || []).filter((s) => s.count > 0)
    ), [analytics.teamPerformance]);

    const cancelReasonItems = useMemo(() => (
        analytics.resultRecap?.cancelReasons?.items || []
    ), [analytics.resultRecap]);

    const salesRows = useMemo(() => {
        const perf = analytics.teamPerformance;
        if (!perf?.teams?.length) return [];
        const teams = selectedTeam ? [selectedTeam] : perf.teams;
        return teams.flatMap((team) =>
            (team.sales || []).map((s) => ({
                ...s,
                teamName: team.teamId === 'unassigned_sup' ? 'PIC Agent' : (team.teamName || ''),
            }))
        );
    }, [analytics.teamPerformance, selectedTeam]);

    const dashboardTitle = useMemo(() => {
        if (user?.role === 'sales' && user?.name) return user.name;
        const shortRoleLabel = user?.role === 'client_admin' ? 'Admin' : user?.role === 'root_admin' ? 'Root Admin' : getRoleLabel(user?.role);
        const clientName = analytics.hierarchySummary?.client?.name || formatClientNameFromSlug(user?.clientSlug) || '';
        if (clientName && user?.role && user.role !== 'root_admin') return `${clientName} ${shortRoleLabel} Dashboard`;
        return `${shortRoleLabel} Dashboard`;
    }, [analytics.hierarchySummary?.client?.name, getRoleLabel, user?.clientSlug, user?.role, user?.name]);

    const loadDashboardAnalytics = useCallback(async (range = EMPTY_DATE_RANGE) => {
        if (!user) { setPageAnalytics(null); return null; }
        const data = await apiRequest(`/api/dashboard/home-analytics${buildDashboardQuery(range)}`, { user });
        setDashboardError('');
        setPageAnalytics(data || DEFAULT_ANALYTICS);
        return data || DEFAULT_ANALYTICS;
    }, [user]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: useCallback(async () => { await loadDashboardAnalytics(appliedDateRange); }, [appliedDateRange, loadDashboardAnalytics]),
    });

    useEffect(() => {
        document.body.classList.add('dash-body');
        return () => document.body.classList.remove('dash-body');
    }, []);

    useEffect(() => {
        if (!dateFilterOpen) return undefined;
        const handlePointerDown = (e) => {
            if (globalFilterRef.current && !globalFilterRef.current.contains(e.target)) {
                setDateFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [dateFilterOpen]);

    useEffect(() => {
        if (!user) {
            setPageAnalytics(null);
            const nextRange = getPresetRange('today');
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setDateFilterOpen(false);
        }
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
            await apiRequest(`/api/distribution/leads/${leadId}/start`, { method: 'POST', user });
            await refreshAll();
            await loadDashboardAnalytics(appliedDateRange);
            setHoldActionMessage('Distribusi untuk lead hold berhasil dimulai.');
        } catch (err) {
            setHoldActionError(err instanceof Error ? err.message : 'Gagal memulai distribusi lead hold');
        } finally {
            setHoldActionLoadingId('');
        }
    };

    const applyPreset = async (key) => {
        const nextRange = getPresetRange(key);
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setDateFilterOpen(false);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleApplyDateFilter = async () => {
        const nextRange = normalizeDateRange({ dateFrom: draftDateRange.dateFrom, dateTo: draftDateRange.dateTo || draftDateRange.dateFrom });
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setDateFilterOpen(false);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleClearDateFilter = async () => {
        const nextRange = getPresetRange('last30');
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
            setDraftDateRange(nextRange);
            setDateFilterOpen(false);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const isCustomActive = !QUICK_RANGES.some((r) => {
        const pr = getPresetRange(r.key);
        return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
    });

    const resultPieTotal = resultPieItems.reduce((s, i) => s + i.count, 0);

    return (
        <div className="page-container dash-page">
            <Header
                title={dashboardTitle}
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                        {refreshing ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            {/* ── Date + SPV filter ── */}
            {showDateFilter ? (
                <div className="dash-filter-bar" ref={globalFilterRef}>
                    <div className="dash-filter-pills">
                        {QUICK_RANGES.map((preset) => {
                            const pr = getPresetRange(preset.key);
                            const isActive = pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
                            return (
                                <button
                                    key={preset.key}
                                    type="button"
                                    className={`dash-filter-pill${isActive ? ' is-active' : ''}`}
                                    onClick={() => void applyPreset(preset.key)}
                                >
                                    {isActive && filterLoading ? 'Memuat...' : preset.label}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            className={`dash-filter-pill dash-filter-pill--custom${isCustomActive ? ' is-active' : ''}`}
                            onClick={() => {
                                if (dateFilterOpen) { setDateFilterOpen(false); return; }
                                setDraftDateRange(normalizeDateRange(appliedDateRange));
                                setDateFilterOpen(true);
                            }}
                        >
                            {isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Custom'}
                        </button>
                    </div>
                    <p className="dash-filter-summary">
                        {filterLoading ? 'Memuat data...' : formatRangeSummary(appliedDateRange)}
                    </p>

                    {canUseTeamFilters && teamOptions.length > 0 ? (
                        <div className="dash-filter-spv-row">
                            <span className="dash-filter-spv-label">SPV</span>
                            <div className="dash-filter-pills">
                                <button
                                    type="button"
                                    className={`dash-filter-pill dash-filter-pill--spv${selectedTeamId === 'all' ? ' is-active' : ''}`}
                                    onClick={() => setSelectedTeamId('all')}
                                >
                                    Semua
                                </button>
                                {teamOptions.map((team) => (
                                    <button
                                        key={team.id}
                                        type="button"
                                        className={`dash-filter-pill dash-filter-pill--spv${selectedTeamId === team.id ? ' is-active' : ''}`}
                                        onClick={() => setSelectedTeamId(team.id)}
                                    >
                                        {team.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {dateFilterOpen ? (
                        <div className="dash-filter-popover">
                            <DateRangePicker
                                dateFrom={draftDateRange.dateFrom}
                                dateTo={draftDateRange.dateTo}
                                onChange={(range) => setDraftDateRange(range)}
                            />
                            <div className="dash-filter-actions">
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => void handleClearDateFilter()} disabled={filterLoading}>
                                    Reset
                                </button>
                                <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleApplyDateFilter()} disabled={filterLoading || !draftDateRange.dateFrom}>
                                    {filterLoading ? 'Loading...' : 'Terapkan'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Alerts ── */}
            {dashboardError ? <div className="dash-alert dash-alert--danger"><p className="dash-alert-body">{dashboardError}</p></div> : null}

            {user?.role === 'sales' && user?.isSuspended && user?.suspension ? (
                <div className="dash-alert dash-alert--danger">
                    <div className="dash-alert-header">
                        <span className="dash-alert-icon">⛔</span>
                        <strong className="dash-alert-title">Akun Disuspend dari Distribution Queue</strong>
                        <span className="dash-alert-badge">Layer {user.suspension?.penaltyLayer || '-'}</span>
                    </div>
                    <p className="dash-alert-body">Anda tidak akan menerima distribusi lead baru selama masa suspend aktif.</p>
                    <div className="dash-alert-meta">
                        <span>Suspend sampai: <strong>{formatSuspensionUntil(user.suspension?.suspendedUntil)}</strong></span>
                        <span>Durasi: <strong>{user.suspension?.suspendedDays || 0} hari</strong></span>
                    </div>
                </div>
            ) : null}


            {/* ── Donut charts row ── */}
            <div className="dash-chart-row">
                <div className="dash-chart-card">
                    <div className="dash-chart-card-head">
                        <div>
                            <span className="dash-section-label">Distribusi</span>
                            <h2 className="dash-section-title">Status Leads</h2>
                        </div>
                        {selectedTeam ? <span className="dash-chart-note">Data keseluruhan</span> : null}
                    </div>
                    {statusPieItems.length === 0
                        ? <div className="dash-empty">Belum ada data status</div>
                        : <DonutChart items={statusPieItems} centerLabel="Total" centerValue={fmt(analytics.statusPie?.total || 0)} />
                    }
                </div>
                <div className="dash-chart-card">
                    <div className="dash-chart-card-head">
                        <div>
                            <span className="dash-section-label">Hasil</span>
                            <h2 className="dash-section-title">Transaksi</h2>
                        </div>
                    </div>
                    {resultPieItems.length === 0
                        ? <div className="dash-empty">Belum ada data transaksi</div>
                        : <DonutChart items={resultPieItems} centerLabel="Transaksi" centerValue={fmt(resultPieTotal)} />
                    }
                </div>
            </div>

            {/* ── Source + Cancel breakdown ── */}
            {(sourceBreakdownItems.length > 0 || cancelReasonItems.length > 0) ? (
                <div className="dash-chart-row">
                    {sourceBreakdownItems.length > 0 ? (
                        <div className="dash-chart-card">
                            <div className="dash-chart-card-head">
                                <div>
                                    <span className="dash-section-label">Sumber</span>
                                    <h2 className="dash-section-title">Lead Source</h2>
                                </div>
                            </div>
                            <MiniBarList items={sourceBreakdownItems} />
                        </div>
                    ) : null}
                    {cancelReasonItems.length > 0 ? (
                        <div className="dash-chart-card">
                            <div className="dash-chart-card-head">
                                <div>
                                    <span className="dash-section-label">Analisa</span>
                                    <h2 className="dash-section-title">Alasan Cancel</h2>
                                </div>
                            </div>
                            <MiniBarList items={cancelReasonItems} />
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Sales performance table ── */}
            {salesRows.length > 0 ? (
                <div className="dash-section">
                    <div className="dash-section-head">
                        <div>
                            <span className="dash-section-label">Performa</span>
                            <h2 className="dash-section-title">Sales Performance</h2>
                        </div>
                    </div>
                    <div className="dash-table-wrap">
                        <table className="dash-table">
                            <thead>
                                <tr>
                                    <th>Sales</th>
                                    <th className="dash-th-num">Leads</th>
                                    <th className="dash-th-num">Hot</th>
                                    <th className="dash-th-num">Mau Survey</th>
                                    <th className="dash-th-num">Survey</th>
                                    <th className="dash-th-num">Full Book</th>
                                    <th className="dash-th-num">Survey Rate</th>
                                    <th className="dash-th-num">Closing Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesRows.map((s) => (
                                    <tr key={s.salesId}>
                                        <td>
                                            <div className="dash-table-name">{s.salesName}</div>
                                            {canUseTeamFilters && s.teamName ? <div className="dash-table-sub">{s.teamName}</div> : null}
                                        </td>
                                        <td className="dash-td-num">{fmt(s.prospek)}</td>
                                        <td className="dash-td-num">{fmt(s.hot)}</td>
                                        <td className="dash-td-num">{fmt(s.mauSurvey)}</td>
                                        <td className="dash-td-num">{fmt(s.survey)}</td>
                                        <td className="dash-td-num">{fmt(s.fullBook)}</td>
                                        <td className="dash-td-num dash-td-rate">{Number(s.surveyRate || 0).toFixed(1)}%</td>
                                        <td className="dash-td-num dash-td-rate">{Number(s.closingRate || 0).toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {/* ── Appointments + Hold leads ── */}
            {(showRoleReminder && analytics.ongoingAppointments.length > 0) || (isAdmin && analytics.holdLeads.length > 0) ? (
                <div className="dash-two-col">
                    {showRoleReminder && analytics.ongoingAppointments.length > 0 ? (
                        <div className="dash-section">
                            <div className="dash-section-head">
                                <div>
                                    <span className="dash-section-label">Pengingat</span>
                                    <h2 className="dash-section-title">Mau Survey ({analytics.ongoingAppointments.length})</h2>
                                </div>
                            </div>
                            <div className="dash-card-list">
                                {analytics.ongoingAppointments.map((item) => (
                                    <div key={item.id} className="dash-card dash-card--clickable" onClick={() => router.push(`/leads/${item.leadId}`)}>
                                        <div className="dash-card-row">
                                            <span className="dash-card-name">{item.leadName}</span>
                                            <span className="dash-badge dash-badge--amber">Mau Survey</span>
                                        </div>
                                        <div className="dash-card-meta">
                                            <span>📱 {item.leadPhone}</span>
                                            <span>🗓️ {formatReminderDateTime(item.date, item.time)}</span>
                                        </div>
                                        {item.location ? <div className="dash-card-meta"><span>📍 {item.location}</span></div> : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {isAdmin && analytics.holdLeads.length > 0 ? (
                        <div className="dash-section">
                            <div className="dash-section-head">
                                <div>
                                    <span className="dash-section-label">Perlu Aksi</span>
                                    <h2 className="dash-section-title">Leads Hold ({analytics.holdLeads.length})</h2>
                                </div>
                            </div>
                            {holdActionError ? <div className="dash-alert dash-alert--danger" style={{ marginBottom: 10 }}><p className="dash-alert-body">{holdActionError}</p></div> : null}
                            {holdActionMessage ? <div className="dash-alert dash-alert--success" style={{ marginBottom: 10 }}><p className="dash-alert-body">{holdActionMessage}</p></div> : null}
                            <div className="dash-card-list">
                                {analytics.holdLeads.map((item) => (
                                    <div key={item.id} className="dash-card">
                                        <div className="dash-card-row">
                                            <span className="dash-card-name">{item.name}</span>
                                            <span className="dash-badge dash-badge--purple">Hold</span>
                                        </div>
                                        <div className="dash-card-meta">
                                            <span>📱 {item.phone}</span>
                                            <span>📣 {item.source}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm btn-full"
                                            onClick={() => void handleStartHeldLead(item.id)}
                                            disabled={holdActionLoadingId === item.id}
                                        >
                                            {holdActionLoadingId === item.id ? 'Starting...' : 'Start Distribution'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Hierarchy overview (root_admin) ── */}
            {showHierarchyOverview && analytics.hierarchySummary ? (
                <div className="dash-section">
                    <div className="dash-section-head">
                        <div>
                            <span className="dash-section-label">Struktur</span>
                            <h2 className="dash-section-title">{analytics.hierarchySummary.roleLabel} Overview</h2>
                        </div>
                    </div>
                    <div className="dash-kpi-grid" style={{ marginBottom: 12 }}>
                        {analytics.hierarchySummary.counts?.clients !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--total"><span className="dash-kpi-label">Clients</span><span className="dash-kpi-value">{analytics.hierarchySummary.counts.clients}</span></div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.clientAdmins !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--reserve"><span className="dash-kpi-label">Client Admins</span><span className="dash-kpi-value">{analytics.hierarchySummary.counts.clientAdmins}</span></div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.supervisors !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--survey"><span className="dash-kpi-label">Supervisors</span><span className="dash-kpi-value">{analytics.hierarchySummary.counts.supervisors}</span></div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.sales !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--closing"><span className="dash-kpi-label">Sales</span><span className="dash-kpi-value">{analytics.hierarchySummary.counts.sales}</span></div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* ── Line Chart ── */}
            <LineChartSection data={analytics.lineChart} dateFilterControl={null} />

        </div>
    );
}
