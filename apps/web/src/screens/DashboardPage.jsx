'use client';

import './DashboardPage.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';
import DateRangePicker from '../components/DateRangePicker';
import SelectFilter from '../components/SelectFilter';
import { usePagePolling } from '../hooks/usePagePolling';
import { useNotifications } from '../hooks/useNotifications';
import TransactionRecapSection from './dashboard-sections/TransactionRecapSection';
import TransactionCompareSection from './dashboard-sections/TransactionCompareSection';
import TeamPerformanceSection from './dashboard-sections/TeamPerformanceSection';
import TeamCompareSection from './dashboard-sections/TeamCompareSection';
import DatabaseControlCenterSection from './dashboard-sections/DatabaseControlCenterSection';
import LineChartSection from './dashboard-sections/LineChartSection';
import DailySalesReportSection from './dashboard-sections/DailySalesReportSection';
import OverviewSection from './dashboard-sections/OverviewSection';

const EMPTY_DATE_RANGE = { dateFrom: '', dateTo: '' };



const PERIOD_SF_OPTIONS = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'last7', label: '7 Hari Terakhir' },
    { value: 'last30', label: '30 Hari Terakhir' },
    { value: 'last90', label: '90 Hari Terakhir' },
    { value: 'thisMonth', label: 'Bulan Ini' },
];

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
    if (!range.dateFrom && !range.dateTo) return 'Kustom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Kustom';
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
    const [selectedSourceFilter, setSelectedSourceFilter] = useState('all');
    const [transactionUnitType, setTransactionUnitType] = useState('');
    const [lineChartGranularity, setLineChartGranularity] = useState('month');
    const [dbSelectedLayer, setDbSelectedLayer] = useState('l1');
    const [showFilterDrawer, setShowFilterDrawer] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [filterLoading, setFilterLoading] = useState(false);
    const [pageAnalytics, setPageAnalytics] = useState(null);
    const [dashboardError, setDashboardError] = useState('');
    const [appliedDateRange, setAppliedDateRange] = useState(() => getPresetRange('today'));

    const showDateFilter = Boolean(user);
    const showHierarchyOverview = user?.role === 'root_admin';
    const canUseTeamFilters = user?.role === 'client_admin' || user?.role === 'root_admin';
    const { count: notifCount } = useNotifications();
    const showDailyReport = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const scopedDashboardLabel =
        user?.role === 'supervisor' ? 'Tim Anda' : user?.role === 'sales' ? 'Data Anda' : 'Semua';

    const analytics = useMemo(() => pageAnalytics ?? dashboardAnalytics ?? DEFAULT_ANALYTICS, [dashboardAnalytics, pageAnalytics]);

    const globalTeamList = useMemo(
        () => analytics.transactionRecap?.teams || analytics.teamPerformance?.teams || [],
        [analytics.transactionRecap, analytics.teamPerformance],
    );

    const teamSourceOptions = useMemo(() => {
        const tpData = analytics.teamPerformance;
        if (!tpData) return [];
        const def = { key: 'all', label: 'Semua Source', count: tpData.totalLeads || tpData.totalProspek || 0 };
        const sbItems = (Array.isArray(tpData.sourceBreakdown) && tpData.sourceBreakdown.length > 0)
            ? tpData.sourceBreakdown
            : (Array.isArray(analytics.databaseControl?.sourceBreakdown) ? analytics.databaseControl.sourceBreakdown : []);
        if (Array.isArray(tpData.sourceOptions) && tpData.sourceOptions.length > 1) {
            return tpData.sourceOptions.some((o) => o.key === 'all') ? tpData.sourceOptions : [def, ...tpData.sourceOptions];
        }
        return sbItems.length > 0 ? [def, ...sbItems.map((item) => ({ key: `source:${item.source}`, label: item.source, count: item.count }))] : [def];
    }, [analytics.teamPerformance, analytics.databaseControl?.sourceBreakdown]);


    const transactionUnitOptions = useMemo(
        () => (analytics.transactionRecap?.unitOptions || []).map((o) => ({ value: o.value, label: o.label })),
        [analytics.transactionRecap],
    );

    const lineChartGranularityOptions = useMemo(
        () => (analytics.lineChart?.granularityOptions || []).map((o) => ({ value: o.key, label: o.label })),
        [analytics.lineChart],
    );



    useEffect(() => {
        if (!analytics.lineChart) return;
        const { granularityOptions, datasetOptions, defaultGranularity, defaultDataset } = analytics.lineChart;
        setLineChartGranularity((prev) => granularityOptions?.some((o) => o.key === prev) ? prev : (defaultGranularity || 'month'));
    }, [analytics.lineChart]);


    const customPickerOpenRef = useRef(null);

    const isCustomActive = !QUICK_RANGES.some((r) => {
        const pr = getPresetRange(r.key);
        return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
    });
    const activePeriodKey = isCustomActive
        ? 'custom'
        : QUICK_RANGES.find((r) => {
            const pr = getPresetRange(r.key);
            return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
        })?.key ?? '';

    const periodOptions = useMemo(() => [
        ...PERIOD_SF_OPTIONS,
        { value: 'custom', label: isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Rentang Kustom' },
    ], [isCustomActive, appliedDateRange]);

    const handlePeriodChange = (v) => {
        if (!v) return;
        if (v === 'custom') { customPickerOpenRef.current?.(); return; }
        void applyPreset(v);
    };

    const dashboardTitle = useMemo(() => {
        if (user?.role === 'sales' && user?.name) return user.name;
        const shortRoleLabel = user?.role === 'client_admin' ? 'Admin' : user?.role === 'root_admin' ? 'Root Admin' : getRoleLabel(user?.role);
        const clientName = analytics.hierarchySummary?.client?.name || formatClientNameFromSlug(user?.clientSlug) || '';
        if (clientName && user?.role && user.role !== 'root_admin') return `${shortRoleLabel} Dashboard`;
        return ` Dashboard`;
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

    const applyPreset = async (key) => {
        const nextRange = getPresetRange(key);
        setFilterLoading(true);
        setDashboardError('');
        setShowFilterDrawer(false);
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
        setShowFilterDrawer(false);
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
                    <button
                        type="button"
                        className="dash-bell-btn"
                        onClick={() => router.push('/notifications')}
                        aria-label="Pengingat"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {notifCount > 0 ? (
                            <span className="dash-bell-badge">{notifCount > 99 ? '99+' : notifCount}</span>
                        ) : null}
                    </button>
                )}
            />

            {/* ── Mobile top bar (hidden on desktop, replaces hidden header) ── */}
            <div className="dash-mobile-top">
                <span className="dash-mobile-top-title">{dashboardTitle}</span>
                <button
                    type="button"
                    className="dash-bell-btn"
                    onClick={() => router.push('/notifications')}
                    aria-label="Pengingat"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {notifCount > 0 ? (
                        <span className="dash-bell-badge">{notifCount > 99 ? '99+' : notifCount}</span>
                    ) : null}
                </button>
            </div>

            {dashboardError ? (
                <div className="dash-alert dash-alert--danger">
                    <p className="dash-alert-body">{dashboardError}</p>
                </div>
            ) : null}

            {user?.role === 'sales' && user?.isSuspended && user?.suspension ? (
                <div className="dash-suspend-banner">
                    <div className="dash-suspend-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                    </div>
                    <div className="dash-suspend-content">
                        <div className="dash-suspend-header">
                            <span className="dash-suspend-title">Akun Disuspend dari Distribution Queue</span>
                            <span className="dash-suspend-badge">Layer {user.suspension?.penaltyLayer || '-'}</span>
                        </div>
                        <p className="dash-suspend-desc">Anda tidak akan menerima distribusi lead baru selama masa suspend aktif.</p>
                        <div className="dash-suspend-meta">
                            <div className="dash-suspend-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                <span>Suspend sampai: <strong>{formatSuspensionUntil(user.suspension?.suspendedUntil)}</strong></span>
                            </div>
                            <div className="dash-suspend-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <span>Durasi: <strong>{user.suspension?.suspendedDays || 0} hari</strong></span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}


            {showHierarchyOverview && analytics.hierarchySummary ? (
                <div className="dash-section">
                    <div className="dash-section-head">
                        <div>
                            <span className="dash-section-label">Struktur</span>
                            <h2 className="dash-section-title">Ringkasan {analytics.hierarchySummary.roleLabel}</h2>
                        </div>
                    </div>
                    <div className="dash-kpi-grid" style={{ marginBottom: 12 }}>
                        {analytics.hierarchySummary.counts?.clients !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--total">
                                <span className="dash-kpi-label">Klien</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.clients}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.clientAdmins !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--reserve">
                                <span className="dash-kpi-label">Admin Klien</span>
                                <span className="dash-kpi-value">{analytics.hierarchySummary.counts.clientAdmins}</span>
                            </div>
                        ) : null}
                        {analytics.hierarchySummary.counts?.supervisors !== undefined ? (
                            <div className="dash-kpi-card dash-kpi-card--survey">
                                <span className="dash-kpi-label">Supervisor</span>
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
                                            {item.isActive ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </div>
                                    <div className="dash-card-meta">
                                        <span>Admin Klien: {item.clientAdmins}</span>
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

            {/* ── Sticky bar: tabs + filter btn ── */}
            <div className="dash-sticky-bar">
                <div className="dash-sticky-bar-row">
                    <div className="dash-section-tabs">
                        {showDailyReport ? (
                            <button type="button" className={`dash-section-tab${activeSectionTab === 'daily-report' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('daily-report')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                <span className="dash-tab-label-full">Laporan Harian</span>
                                <span className="dash-tab-label-short">Harian</span>
                            </button>
                        ) : null}
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'transaction' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('transaction')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            <span className="dash-tab-label-full">Transaksi</span>
                            <span className="dash-tab-label-short">Transaksi</span>
                        </button>
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'team' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('team')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span className="dash-tab-label-full">Tim</span>
                            <span className="dash-tab-label-short">Tim</span>
                        </button>
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'database' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('database')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
                            <span className="dash-tab-label-full">Basis Data</span>
                            <span className="dash-tab-label-short">Data</span>
                        </button>
                        {canUseTeamFilters ? (
                            <button type="button" className={`dash-section-tab${activeSectionTab === 'compare' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('compare')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                                <span className="dash-tab-label-full">Compare View</span>
                                <span className="dash-tab-label-short">Compare</span>
                            </button>
                        ) : null}
                    </div>

                    {showDateFilter ? (
                        <button
                            type="button"
                            className={`dash-filter-toggle${isCustomActive || globalTeamFilter !== 'all' || selectedSourceFilter !== 'all' || transactionUnitType !== '' ? ' has-filter' : ''}`}
                            onClick={() => setShowFilterDrawer(true)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                            </svg>
                            {globalTeamFilter !== 'all' ? <span className="dash-filter-toggle-dot" /> : null}
                        </button>
                    ) : null}
                </div>
            </div>

            {/* ── Filter drawer ── */}
            {showFilterDrawer ? (
                <div className="dash-drawer-overlay" onClick={() => setShowFilterDrawer(false)}>
                    <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="dash-drawer-header">
                            <span className="dash-drawer-title">Filter</span>
                            <button type="button" className="dash-drawer-close" onClick={() => setShowFilterDrawer(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="dash-drawer-body">
                            <div className="dash-drawer-section">
                                <span className="dash-drawer-section-label">Periode</span>
                                <SelectFilter
                                    options={periodOptions}
                                    value={activePeriodKey}
                                    onChange={handlePeriodChange}
                                    placeholder="Pilih Periode"
                                />
                                <DateRangePicker
                                    value={appliedDateRange}
                                    onApply={(range) => void handleApplyDateFilter(range)}
                                    onReset={() => void handleClearDateFilter()}
                                    loading={filterLoading}
                                    trigger={({ open }) => {
                                        customPickerOpenRef.current = open;
                                        return <span style={{ display: 'block', height: 0, visibility: 'hidden' }} />;
                                    }}
                                />
                                <p className="dash-filter-summary" style={{ margin: '8px 0 0' }}>
                                    {filterLoading ? 'Memuat data...' : formatRangeSummary(appliedDateRange)}
                                </p>
                            </div>

                            {canUseTeamFilters && globalTeamList.length > 0 ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Tim (SPV)</span>
                                    <SelectFilter
                                        options={globalTeamList.map((team) => ({
                                            value: team.teamId,
                                            label: team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor' ? 'PIC Agent' : team.teamName,
                                        }))}
                                        value={globalTeamFilter === 'all' ? '' : globalTeamFilter}
                                        onChange={(v) => setGlobalTeamFilter(v || 'all')}
                                        placeholder="Semua Tim"
                                    />
                                </div>
                            ) : null}

                            {teamSourceOptions.length > 1 ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Sumber Leads</span>
                                    <SelectFilter
                                        options={teamSourceOptions.filter((o) => o.key !== 'all').map((o) => ({
                                            value: o.key,
                                            label: o.count !== undefined ? `${o.label} (${o.count})` : o.label,
                                        }))}
                                        value={selectedSourceFilter === 'all' ? '' : selectedSourceFilter}
                                        onChange={(v) => setSelectedSourceFilter(v || 'all')}
                                        placeholder="Semua Source"
                                    />
                                </div>
                            ) : null}


                            {activeSectionTab === 'transaction' && transactionUnitOptions.length > 0 ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Tipe Unit</span>
                                    <SelectFilter
                                        options={transactionUnitOptions}
                                        value={transactionUnitType}
                                        onChange={setTransactionUnitType}
                                        placeholder="Semua Tipe"
                                    />
                                </div>
                            ) : null}

                            {activeSectionTab === 'database' && lineChartGranularityOptions.length > 0 ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Granularitas</span>
                                    <SelectFilter
                                        options={lineChartGranularityOptions}
                                        value={lineChartGranularity}
                                        onChange={(v) => setLineChartGranularity(v || 'month')}
                                        placeholder="Pilih Granularitas"
                                    />
                                </div>
                            ) : null}


                        </div>
                    </div>
                </div>
            ) : null}

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
                    unitType={transactionUnitType}
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
                    selectedSourceFilter={selectedSourceFilter}
                    onSourceFilterChange={setSelectedSourceFilter}
                />
            ) : null}

            {activeSectionTab === 'compare' && canUseTeamFilters ? (
                <>
                    <TransactionCompareSection
                        data={analytics.transactionRecap}
                        allowTeamFiltering
                        showCrossTeamInsights
                        scopeLabel={scopedDashboardLabel}
                        viewerRole={user?.role}
                        viewerId={user?.id}
                        viewerName={user?.name}
                        selectedTeam="all"
                        unitType={transactionUnitType}
                    />
                    <TeamCompareSection
                        data={analytics.teamPerformance}
                        sourceBreakdown={analytics.databaseControl?.sourceBreakdown || []}
                        allowTeamFiltering
                        autoShowScopedDetails={false}
                        scopeLabel={scopedDashboardLabel}
                        selectedTeam="all"
                        selectedSourceFilter={selectedSourceFilter}
                        onSourceFilterChange={setSelectedSourceFilter}
                    />
                </>
            ) : null}

            {activeSectionTab === 'database' ? (
                <>
                    <DatabaseControlCenterSection
                        data={analytics.databaseControl}
                        allowScopeFiltering={canUseTeamFilters}
                        scopeLabel={scopedDashboardLabel}
                        selectedTeam={globalTeamFilter}
                        selectedLayer={dbSelectedLayer}
                        onLayerChange={setDbSelectedLayer}
                    />
                    <LineChartSection
                        data={analytics.lineChart}
                        granularity={lineChartGranularity}
                        onGranularityChange={setLineChartGranularity}
                        dataset={dbSelectedLayer}
                    />
                </>
            ) : null}
        </div>
    );
}
