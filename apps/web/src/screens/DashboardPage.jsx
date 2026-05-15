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
import TransactionRecapSection from './dashboard-sections/TransactionRecapSection';
import TeamPerformanceSection from './dashboard-sections/TeamPerformanceSection';
import DatabaseControlCenterSection from './dashboard-sections/DatabaseControlCenterSection';
import LineChartSection from './dashboard-sections/LineChartSection';
import DailySalesReportSection from './dashboard-sections/DailySalesReportSection';

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
    { key: 'last7', label: '7 Hari Terakhir' },
    { key: 'last30', label: '30 Hari Terakhir' },
    { key: 'last90', label: '90 Hari Terakhir' },
    { key: 'thisMonth', label: 'Bulan Ini' },
];

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

export default function DashboardPage() {
    const { user, isAdmin, getRoleLabel } = useAuth();
    const { dashboardAnalytics, refreshAll } = useLeads();
    const router = useRouter();

    const [activeSectionTab, setActiveSectionTab] = useState('transaction');
    const [globalTeamFilter, setGlobalTeamFilter] = useState('all');
    const [refreshing, setRefreshing] = useState(false);
    const [filterLoading, setFilterLoading] = useState(false);
    const [pageAnalytics, setPageAnalytics] = useState(null);
    const [dashboardError, setDashboardError] = useState('');
    const [holdActionLoadingId, setHoldActionLoadingId] = useState('');
    const [holdActionMessage, setHoldActionMessage] = useState('');
    const [holdActionError, setHoldActionError] = useState('');
    const [appliedDateRange, setAppliedDateRange] = useState(() => getPresetRange('today'));

    const showDateFilter = Boolean(user);
    const showHierarchyOverview = user?.role === 'root_admin';
    const canUseTeamFilters = user?.role === 'client_admin' || user?.role === 'root_admin';
    const showRoleReminder = user?.role === 'supervisor' || user?.role === 'sales';
    const showDailyReport = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const scopedDashboardLabel =
        user?.role === 'supervisor' ? 'Tim Anda' : user?.role === 'sales' ? 'Data Anda' : 'Semua';

    const analytics = useMemo(() => pageAnalytics ?? dashboardAnalytics ?? DEFAULT_ANALYTICS, [dashboardAnalytics, pageAnalytics]);

    const globalTeamList = useMemo(
        () => analytics.transactionRecap?.teams || analytics.teamPerformance?.teams || [],
        [analytics.transactionRecap, analytics.teamPerformance],
    );

    const holdLeads = analytics.holdLeads;
    const holdCols = Math.min(holdLeads.length, 5);

    const isCustomActive = !QUICK_RANGES.some((r) => {
        const pr = getPresetRange(r.key);
        return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
    });

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
        if (!user) {
            setPageAnalytics(null);
            setAppliedDateRange(getPresetRange('today'));
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
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleApplyDateFilter = async (range) => {
        const nextRange = normalizeDateRange(range);
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(nextRange);
            setAppliedDateRange(nextRange);
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
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

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

            {dashboardError ? (
                <div className="dash-alert dash-alert--danger">
                    <p className="dash-alert-body">{dashboardError}</p>
                </div>
            ) : null}

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
                                {user?.role === 'supervisor' && item.salesName ? (
                                    <div className="dash-card-meta"><span>Sales: {item.salesName}</span></div>
                                ) : null}
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
                    {holdActionError ? (
                        <div className="dash-alert dash-alert--danger" style={{ marginBottom: 10 }}>
                            <p className="dash-alert-body">{holdActionError}</p>
                        </div>
                    ) : null}
                    {holdActionMessage ? (
                        <div className="dash-alert dash-alert--success" style={{ marginBottom: 10 }}>
                            <p className="dash-alert-body">{holdActionMessage}</p>
                        </div>
                    ) : null}
                    <div className="dash-hold-grid" style={{ gridTemplateColumns: `repeat(${holdCols}, minmax(0, 1fr))` }}>
                        {holdLeads.map((item) => (
                            <div key={item.id} className="dash-hold-card">
                                <div className="dash-hold-card-body">
                                    <div className="dash-hold-card-row">
                                        <span className="dash-hold-card-name">{item.name}</span>
                                        <span className="dash-badge dash-badge--amber">
                                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 3 }}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                            Hold
                                        </span>
                                    </div>
                                    <div className="dash-hold-card-meta">
                                        <span className="dash-hold-meta-item">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                            {item.phone}
                                        </span>
                                        <span className="dash-hold-meta-item">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                            {item.source}
                                        </span>
                                    </div>
                                    <div className="dash-hold-card-date">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                        {new Date(item.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <div className="dash-hold-card-footer">
                                    <button
                                        type="button"
                                        className="dash-hold-start-btn"
                                        onClick={() => void handleStartHeldLead(item.id)}
                                        disabled={holdActionLoadingId === item.id}
                                    >
                                        {holdActionLoadingId === item.id ? (
                                            <span>Memulai...</span>
                                        ) : (
                                            <>
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                                <span>Start Distribution</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

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
                            <div className="dash-kpi-card dash-kpi-card--total">
                                <span className="dash-kpi-label">Clients</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.clients}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.clientAdmins !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--reserve">
                                <span className="dash-kpi-label">Client Admins</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.clientAdmins}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.supervisors !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--survey">
                                <span className="dash-kpi-label">Supervisors</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.supervisors}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.sales !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--closing">
                                <span className="dash-kpi-label">Sales</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.sales}</span>
                            </div>
                        ) : null}
                    </div>

                    {Array.isArray(analytics.hierarchySummary.clients) && analytics.hierarchySummary.clients.length > 0 ? (
                        <div className="dash-card-list" style={{ marginBottom: 12 }}>
                            {analytics.hierarchySummary.clients.map((item) => (
                                <div key={item.id} className="dash-card">
                                    <div className="dash-card-row">
                                        <span className="dash-card-name">{item.name}</span>
                                        <span className={`dash-badge ${item.isActive ? 'dash-badge--green' : 'dash-badge--red'}`}>
                                            {item.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="dash-card-meta">
                                        <span>Client Admin: {item.clientAdmins}</span>
                                        <span>Supervisor: {item.supervisors}</span>
                                        <span>Sales: {item.sales}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {Array.isArray(analytics.hierarchySummary.supervisors) && analytics.hierarchySummary.supervisors.length > 0 ? (
                        <div className="dash-card-list" style={{ marginBottom: 12 }}>
                            {analytics.hierarchySummary.supervisors.map((item) => (
                                <div key={item.id} className="dash-card dash-card--clickable" onClick={() => router.push(`/team/${item.id}`)}>
                                    <div className="dash-card-row">
                                        <span className="dash-card-name">{item.name}</span>
                                        <span className="dash-badge dash-badge--purple">{item.salesCount} Sales</span>
                                    </div>
                                    <div className="dash-card-meta"><span>{item.email}</span></div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {Array.isArray(analytics.hierarchySummary.sales) && analytics.hierarchySummary.sales.length > 0 ? (
                        <div className="dash-card-list">
                            {analytics.hierarchySummary.sales.map((item) => (
                                <div key={item.id} className="dash-card dash-card--clickable" onClick={() => router.push(`/team/${item.id}`)}>
                                    <div className="dash-card-row">
                                        <span className="dash-card-name">{item.name}</span>
                                    </div>
                                    <div className="dash-card-meta"><span>{item.email}</span></div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Sticky bar: tabs + filter ── */}
            <div className="dash-sticky-bar">
                <div className="dash-section-tabs">
                    {showDailyReport ? (
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'daily-report' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('daily-report')}>Daily Report</button>
                    ) : null}
                    <button type="button" className={`dash-section-tab${activeSectionTab === 'transaction' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('transaction')}>Transaction</button>
                    <button type="button" className={`dash-section-tab${activeSectionTab === 'team' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('team')}>Team Performance</button>
                    <button type="button" className={`dash-section-tab${activeSectionTab === 'database' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('database')}>Database</button>
                    <button type="button" className={`dash-section-tab${activeSectionTab === 'chart' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('chart')}>Line Chart</button>
                </div>

                {showDateFilter ? (
                    <div className="dash-filter-bar">
                        <div className="dash-filter-pills">
                            {QUICK_RANGES.map((preset) => {
                                const pr = getPresetRange(preset.key);
                                const isActive = pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
                                return (
                                    <button key={preset.key} type="button" className={`dash-filter-pill${isActive ? ' is-active' : ''}`} onClick={() => void applyPreset(preset.key)}>
                                        {isActive && filterLoading ? 'Memuat...' : preset.label}
                                    </button>
                                );
                            })}
                            <DateRangePicker
                                value={appliedDateRange}
                                onApply={(range) => void handleApplyDateFilter(range)}
                                onReset={() => void handleClearDateFilter()}
                                loading={filterLoading}
                                trigger={({ open }) => (
                                    <button
                                        type="button"
                                        className={`dash-filter-pill dash-filter-pill--custom${isCustomActive ? ' is-active' : ''}`}
                                        onClick={open}
                                    >
                                        {isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Custom'}
                                    </button>
                                )}
                            />
                        </div>

                        <p className="dash-filter-summary">
                            {filterLoading ? 'Memuat data...' : formatRangeSummary(appliedDateRange)}
                        </p>

                        {canUseTeamFilters && globalTeamList.length > 0 ? (
                            <div className="dash-filter-spv-row">
                                <span className="dash-filter-spv-label">SPV</span>
                                <div className="dash-filter-pills">
                                    <button
                                        type="button"
                                        className={`dash-filter-pill dash-filter-pill--spv${globalTeamFilter === 'all' ? ' is-active' : ''}`}
                                        onClick={() => setGlobalTeamFilter('all')}
                                    >
                                        Semua
                                    </button>
                                    {globalTeamList.map((team) => {
                                        const label = team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor' ? 'PIC Agent' : team.teamName;
                                        return (
                                            <button
                                                key={team.teamId}
                                                type="button"
                                                className={`dash-filter-pill dash-filter-pill--spv${globalTeamFilter === team.teamId ? ' is-active' : ''}`}
                                                onClick={() => setGlobalTeamFilter(team.teamId)}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                    </div>
                ) : null}
            </div>

            {/* ── Tab content ── */}
            {activeSectionTab === 'daily-report' && showDailyReport ? (
                <DailySalesReportSection data={analytics.dailySalesReport} />
            ) : null}

            {activeSectionTab === 'transaction' ? (
                <TransactionRecapSection
                    data={analytics.transactionRecap}
                    allowTeamFiltering={canUseTeamFilters}
                    showCrossTeamInsights={canUseTeamFilters}
                    scopeLabel={scopedDashboardLabel}
                    viewerRole={user?.role}
                    viewerId={user?.id}
                    viewerName={user?.name}
                    selectedTeam={globalTeamFilter}
                />
            ) : null}

            {activeSectionTab === 'team' ? (
                <TeamPerformanceSection
                    data={analytics.teamPerformance}
                    sourceBreakdown={analytics.databaseControl?.sourceBreakdown || []}
                    allowTeamFiltering={canUseTeamFilters}
                    autoShowScopedDetails={!canUseTeamFilters}
                    scopeLabel={scopedDashboardLabel}
                    selectedTeam={globalTeamFilter}
                />
            ) : null}

            {activeSectionTab === 'database' ? (
                <DatabaseControlCenterSection
                    data={analytics.databaseControl}
                    allowScopeFiltering={canUseTeamFilters}
                    scopeLabel={scopedDashboardLabel}
                    selectedTeam={globalTeamFilter}
                />
            ) : null}

            {activeSectionTab === 'chart' ? (
                <LineChartSection data={analytics.lineChart} />
            ) : null}
        </div>
    );
}
