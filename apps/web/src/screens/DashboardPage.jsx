'use client';

import './DashboardPage.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';
import DateRangePicker from '../components/DateRangePicker';
import Select from '../components/Select';
import { usePagePolling } from '../hooks/usePagePolling';
import { useNavData } from '../hooks/useNavData';
import { DATE_PRESET_OPTIONS, getPresetRange, parseDateInput } from '../utils/datePresets';
import TransactionRecapSection from './dashboard-sections/TransactionRecapSection';
import TransactionCompareSection from './dashboard-sections/TransactionCompareSection';
import TeamPerformanceSection from './dashboard-sections/TeamPerformanceSection';
import TeamCompareSection from './dashboard-sections/TeamCompareSection';
import DatabaseControlCenterSection from './dashboard-sections/DatabaseControlCenterSection';
import LineChartSection from './dashboard-sections/LineChartSection';
import DailySalesReportSection from './dashboard-sections/DailySalesReportSection';
import OverviewSection from './dashboard-sections/OverviewSection';
import AnalyticsSection from './dashboard-sections/AnalyticsSection';
import SalesPerformanceSection from './dashboard-sections/SalesPerformanceSection';
import DailyReportHeaderSection from './dashboard-sections/DailyReportHeaderSection';

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

function buildDashboardQuery(range, sourceFilter = 'all') {
    const params = new URLSearchParams();
    if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
    if (range?.dateTo) params.set('dateTo', range.dateTo);
    const source = String(sourceFilter || '').trim();
    if (source && source !== 'all') params.set('source', source);
    const query = params.toString();
    return query ? `?${query}` : '';
}

function formatClientNameFromSlug(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function DashboardPage() {
    const { user, isAdmin, getRoleLabel } = useAuth();
    const { dashboardAnalytics, refreshAll, leads, salesUsers, leadSources } = useLeads();
    const router = useRouter();

    const [activeSectionTab, setActiveSectionTab] = useState('overview');
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
    const [appliedDateRange, setAppliedDateRange] = useState(() => getPresetRange('thisMonth'));
    const [projectUnits, setProjectUnits] = useState([]);
    const [cancelReasons, setCancelReasons] = useState([]);

    const showDateFilter = Boolean(user);
    const showHierarchyOverview = user?.role === 'root_admin';
    const canUseTeamFilters = user?.role === 'client_admin' || user?.role === 'root_admin';
    const { navNotificationCount: notifCount } = useNavData();
    const showDailyReport = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const showTeamPerformance = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
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

    const analyticsSourceOptions = useMemo(() => {
        const sourceMap = new Map();
        const addSource = (value) => {
            const label = String(value || '').trim();
            if (!label) return;
            sourceMap.set(label.toLowerCase(), label);
        };

        for (const item of Array.isArray(leadSources) ? leadSources : []) {
            addSource(item?.value || item?.name || item?.label);
        }
        for (const item of Array.isArray(leads) ? leads : []) {
            addSource(item?.source);
        }
        for (const item of analytics.databaseControl?.sourceBreakdown || []) {
            addSource(item?.source || item?.label);
        }

        return [
            { value: 'all', label: 'Semua Sumber Data' },
            ...Array.from(sourceMap.values())
                .sort((a, b) => a.localeCompare(b))
                .map((source) => ({ value: source, label: source })),
        ];
    }, [analytics.databaseControl?.sourceBreakdown, leadSources, leads]);


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

    const isCustomActive = !DATE_PRESET_OPTIONS.some((r) => {
        const pr = getPresetRange(r.value);
        return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
    });
    const activePeriodKey = isCustomActive
        ? 'custom'
        : DATE_PRESET_OPTIONS.find((r) => {
            const pr = getPresetRange(r.value);
            return pr.dateFrom === appliedDateRange.dateFrom && pr.dateTo === appliedDateRange.dateTo;
        })?.value ?? '';

    const periodOptions = useMemo(() => [
        ...DATE_PRESET_OPTIONS.map(({ value, label }) => ({ value, label })),
        { value: 'custom', label: isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Rentang Kustom' },
    ], [isCustomActive, appliedDateRange]);

    const transactionPeriodLabel = isCustomActive
        ? formatRangeButtonLabel(appliedDateRange)
        : (DATE_PRESET_OPTIONS.find((o) => o.value === activePeriodKey)?.label ?? '');

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

    const loadDashboardAnalytics = useCallback(async (range = EMPTY_DATE_RANGE, sourceFilter = selectedSourceFilter) => {
        if (!user) { setPageAnalytics(null); return null; }
        const data = await apiRequest(`/api/dashboard/home-analytics${buildDashboardQuery(range, sourceFilter)}`, { user });
        setDashboardError('');
        setPageAnalytics(data || DEFAULT_ANALYTICS);
        return data || DEFAULT_ANALYTICS;
    }, [selectedSourceFilter, user]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: useCallback(async () => { await loadDashboardAnalytics(appliedDateRange, selectedSourceFilter); }, [appliedDateRange, loadDashboardAnalytics, selectedSourceFilter]),
    });

    useEffect(() => {
        document.body.classList.add('dash-body');
        return () => document.body.classList.remove('dash-body');
    }, []);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await apiRequest(`/api/dashboard/home-analytics${buildDashboardQuery(appliedDateRange, selectedSourceFilter)}`, { user });
                if (!cancelled) {
                    setDashboardError('');
                    setPageAnalytics(data || DEFAULT_ANALYTICS);
                }
            } catch (err) {
                if (!cancelled) {
                    setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id, user?.role, user?.clientSlug]);

    useEffect(() => {
        if (!user) {
            setPageAnalytics(null);
            setAppliedDateRange(getPresetRange('thisMonth'));
            setSelectedSourceFilter('all');
            setProjectUnits([]);
            setCancelReasons([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [units, reasons] = await Promise.all([
                    apiRequest('/api/units', { user }).catch(() => []),
                    apiRequest('/api/cancel-reasons', { user }).catch(() => []),
                ]);
                if (cancelled) return;
                setProjectUnits(Array.isArray(units) ? units : []);
                setCancelReasons(Array.isArray(reasons) ? reasons : []);
            } catch {
                // ignore
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setDashboardError('');
        try {
            await refreshAll();
            await loadDashboardAnalytics(appliedDateRange, selectedSourceFilter);
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
            await loadDashboardAnalytics(nextRange, selectedSourceFilter);
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
            await loadDashboardAnalytics(nextRange, selectedSourceFilter);
            setAppliedDateRange(nextRange);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleSourceFilterChange = async (source) => {
        const nextSource = source || 'all';
        setSelectedSourceFilter(nextSource);
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(appliedDateRange, nextSource);
        } catch (err) {
            setDashboardError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
        } finally {
            setFilterLoading(false);
        }
    };

    const handleClearDateFilter = async () => {
        const nextRange = getPresetRange('thisMonth');
        setFilterLoading(true);
        setDashboardError('');
        try {
            await loadDashboardAnalytics(nextRange, selectedSourceFilter);
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
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                <span>Suspend sampai: <strong>{formatSuspensionUntil(user.suspension?.suspendedUntil)}</strong></span>
                            </div>
                            <div className="dash-suspend-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
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
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'overview' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('overview')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" /></svg>
                            <span className="dash-tab-label-full">Laporan</span>
                            <span className="dash-tab-label-short">Laporan</span>
                        </button>
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'analytics' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('analytics')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1.4" /><circle cx="4" cy="12" r="1.4" /><circle cx="4" cy="18" r="1.4" /></svg>
                            <span className="dash-tab-label-full">Ringkasan</span>
                            <span className="dash-tab-label-short">Ringkasan</span>
                        </button>
                        {showTeamPerformance ? (
                            <button type="button" className={`dash-section-tab${activeSectionTab === 'team-performance' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('team-performance')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                <span className="dash-tab-label-full">Performa Tim</span>
                                <span className="dash-tab-label-short">Performa</span>
                            </button>
                        ) : null}
                        <button type="button" className={`dash-section-tab${activeSectionTab === 'line-chart' ? ' is-active' : ''}`} onClick={() => setActiveSectionTab('line-chart')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                            <span className="dash-tab-label-full">Grafik</span>
                            <span className="dash-tab-label-short">Grafik</span>
                        </button>
                    </div>

                </div>
            </div>

            {/* ── Date range drawer ── */}
            {showFilterDrawer ? (
                <div className="dash-drawer-overlay" onClick={() => setShowFilterDrawer(false)}>
                    <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="dash-drawer-header">
                            <span className="dash-drawer-title">Rentang Tanggal</span>
                            <button type="button" className="dash-drawer-close" onClick={() => setShowFilterDrawer(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="dash-drawer-body">
                            <div className="dash-drawer-section">
                                <span className="dash-drawer-section-label">Periode</span>
                                <Select
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
                            {analyticsSourceOptions.length > 1 ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Sumber Data</span>
                                    <Select
                                        options={analyticsSourceOptions}
                                        value={selectedSourceFilter}
                                        onChange={(v) => void handleSourceFilterChange(v)}
                                        placeholder="Semua Sumber Data"
                                        clearable={false}
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

            {activeSectionTab === 'overview' ? (
                <DailyReportHeaderSection user={user} />
            ) : null}

            {activeSectionTab === 'analytics' ? (
                <AnalyticsSection
                    leads={leads}
                    transactionRecap={analytics.transactionRecap}
                    projectUnits={projectUnits}
                    cancelReasons={cancelReasons}
                    appliedDateRange={appliedDateRange}
                    rangeSummary={formatRangeSummary(appliedDateRange)}
                    onDateRangeChange={(range) => void handleApplyDateFilter(range)}
                    sourceOptions={analyticsSourceOptions}
                    selectedSource={selectedSourceFilter}
                    onSourceChange={handleSourceFilterChange}
                    viewerRole={user?.role}
                    viewerId={user?.id}
                />
            ) : null}

            {activeSectionTab === 'team-performance' && showTeamPerformance ? (
                <SalesPerformanceSection user={user} />
            ) : null}

            {activeSectionTab === 'line-chart' ? (
                <LineChartSection
                    leads={leads}
                    transactionRecap={analytics.transactionRecap}
                    viewerRole={user?.role}
                    viewerId={user?.id}
                />
            ) : null}
        </div>
    );
}
