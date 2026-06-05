'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import Select from '../../components/Select';
import DateRangePicker from '../../components/DateRangePicker';
import { DATE_PRESET_OPTIONS, getPresetRange, parseDateInput } from '../../utils/datePresets';
import { formatCount } from './utils';
import './DashboardSections.css';

function formatRangeButtonLabel(range) {
    if (!range?.dateFrom && !range?.dateTo) return 'Kustom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Kustom';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function buildQuery(range) {
    const params = new URLSearchParams();
    if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
    if (range?.dateTo) params.set('dateTo', range.dateTo);
    const q = params.toString();
    return q ? `?${q}` : '';
}

function formatRangeSummary(range) {
    if (!range?.dateFrom && !range?.dateTo) return 'Semua data';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Semua data';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function CalendarIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

const DTR_CATEGORIES = [
    {
        key: 'followUp',
        label: 'Follow Up',
        shortLabel: 'Follow Up',
        metrics: [
            { key: 'newLeads', label: 'New Leads', accent: 'var(--primary)' },
            { key: 'pipeline', label: 'Pipeline', accent: '#7C3AED' },
            { key: 'deadline', label: 'Deadline', accent: '#EF4444' },
        ],
    },
    {
        key: 'survey',
        label: 'Survey',
        shortLabel: 'Survey',
        metrics: [
            { key: 'hariIni', label: 'Hari Ini', accent: 'var(--green)' },
            { key: 'nanti', label: 'Nanti', accent: 'var(--primary)' },
            { key: 'terlewat', label: 'Terlewat', accent: '#EF4444' },
        ],
    },
    {
        key: 'hotDatabase',
        label: 'Hot Database',
        shortLabel: 'Hot DB',
        metrics: [
            { key: 'lessThanMonth', label: '<1 Bln', accent: '#F97316' },
            { key: 'moreThanMonth', label: '>1 Bln', accent: 'var(--text-secondary)' },
        ],
    },
    {
        key: 'transaksi',
        label: 'Transaksi',
        shortLabel: 'Transaksi',
        metrics: [
            { key: 'reserve', label: 'Reserve', accent: 'var(--text-secondary)' },
            { key: 'fullBook', label: 'Full Book', accent: '#7C3AED' },
            { key: 'lunas', label: 'Lunas', accent: '#16A34A' },
        ],
    },
];

export default function DailyReportHeaderSection({ user }) {
    const [dateRange, setDateRange] = useState(() => getPresetRange('today'));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showDrawer, setShowDrawer] = useState(false);
    const [dtrCategory, setDtrCategory] = useState('followUp');
    const [dtrSelectedMetrics, setDtrSelectedMetrics] = useState(() => DTR_CATEGORIES[0].metrics.map((m) => m.key));
    const customPickerOpenRef = useRef(null);

    const fetchData = useCallback(async (range) => {
        if (!user) return;
        setLoading(true);
        setError('');
        try {
            const result = await apiRequest(
                `/api/dashboard/home-analytics${buildQuery(range)}`,
                { user },
            );
            setData(result || null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memuat data');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void fetchData(dateRange);
    }, [fetchData, dateRange]);

    const isCustom = !DATE_PRESET_OPTIONS.some((r) => {
        const pr = getPresetRange(r.value);
        return pr.dateFrom === dateRange.dateFrom && pr.dateTo === dateRange.dateTo;
    });
    const activePeriodKey = isCustom
        ? 'custom'
        : (DATE_PRESET_OPTIONS.find((r) => {
            const pr = getPresetRange(r.value);
            return pr.dateFrom === dateRange.dateFrom && pr.dateTo === dateRange.dateTo;
        })?.value ?? '');

    const periodOptions = useMemo(() => [
        ...DATE_PRESET_OPTIONS.map(({ value, label }) => ({ value, label })),
        { value: 'custom', label: isCustom ? formatRangeButtonLabel(dateRange) : 'Rentang Kustom' },
    ], [isCustom, dateRange]);

    const handlePeriodChange = (v) => {
        if (!v) return;
        if (v === 'custom') { customPickerOpenRef.current?.(); return; }
        setDateRange(getPresetRange(v));
        setShowDrawer(false);
    };

    const handleApplyCustom = (range) => {
        setDateRange({
            dateFrom: range?.dateFrom || '',
            dateTo: range?.dateTo || '',
        });
        setShowDrawer(false);
    };

    const periodLabel = isCustom
        ? formatRangeButtonLabel(dateRange)
        : (DATE_PRESET_OPTIONS.find((r) => r.value === activePeriodKey)?.label || 'Hari Ini');

    const transactionRecap = data?.transactionRecap;
    const resultRecap = data?.resultRecap;
    const databaseControl = data?.databaseControl;

    const databaseItems = useMemo(() => {
        const sources = Array.isArray(databaseControl?.sourceBreakdown) ? databaseControl.sourceBreakdown : [];
        const getCount = (name) => {
            const needle = String(name).trim().toLowerCase();
            const item = sources.find(
                (s) => String(s?.source || '').trim().toLowerCase() === needle,
            );
            return item?.count || 0;
        };
        return [
            { label: 'Walk In', short: 'WI', value: getCount('Walk In') },
            { label: 'Call In', short: 'CI', value: getCount('Call In') },
            { label: 'Online', short: 'Online', value: getCount('Online') },
            { label: 'Offline', short: 'Offline', value: getCount('Offline') },
        ];
    }, [databaseControl]);

    const databaseTotal = useMemo(
        () => databaseItems.reduce((s, i) => s + (i.value || 0), 0),
        [databaseItems],
    );

    const visitItems = useMemo(() => {
        const breakdown = transactionRecap?.groupSurveyBreakdown;
        if (!Array.isArray(breakdown)) return [];
        return breakdown
            .filter((g) => (g.salesCount || 0) > 0)
            .map((g) => ({
                key: g.id,
                label: g.name || 'Tanpa Nama',
                value: g.surveyCount || 0,
            }));
    }, [transactionRecap]);

    const visitTotal = useMemo(
        () => visitItems.reduce((s, i) => s + (i.value || 0), 0),
        [visitItems],
    );

    const transaksiItems = useMemo(() => {
        const totalAkad = transactionRecap?.totalAkad || 0;
        const totalFullBook = transactionRecap?.totalFullBook || 0;
        const totalReserve = transactionRecap?.totalReserve || 0;
        const totalCancelFB = resultRecap?.items?.find((i) => i.key === 'cancel_full_book')?.count || 0;
        const totalCancelReserve = resultRecap?.items?.find((i) => i.key === 'cancel_reserve')?.count || 0;
        return [
            { label: 'Akad', value: totalAkad, color: '#16A34A' },
            { label: 'Full Book', short: 'FB', value: totalFullBook, color: '#7C3AED' },
            { label: 'Cancel FB', short: 'Cancel FB', value: totalCancelFB, color: '#EF4444' },
            { label: 'Reserve', short: 'Reserve', value: totalReserve, color: 'var(--text-secondary)' },
            { label: 'Cancel Reserve', short: 'Cancel Res', value: totalCancelReserve, color: '#F97316' },
        ];
    }, [transactionRecap, resultRecap]);

    const transaksiTotal = useMemo(
        () => (transactionRecap?.totalAkad || 0)
            + (transactionRecap?.totalFullBook || 0)
            + (transactionRecap?.totalReserve || 0),
        [transactionRecap],
    );

    const dailyTaskRecap = useMemo(
        () => (Array.isArray(data?.dailyTaskRecap) ? data.dailyTaskRecap : []),
        [data],
    );

    const dtrActiveCategory = useMemo(
        () => DTR_CATEGORIES.find((c) => c.key === dtrCategory) || DTR_CATEGORIES[0],
        [dtrCategory],
    );

    const dtrVisibleMetrics = useMemo(
        () => dtrActiveCategory.metrics.filter((m) => dtrSelectedMetrics.includes(m.key)),
        [dtrActiveCategory, dtrSelectedMetrics],
    );

    const handleSelectCategory = (key) => {
        const cat = DTR_CATEGORIES.find((c) => c.key === key);
        if (!cat) return;
        setDtrCategory(key);
        setDtrSelectedMetrics(cat.metrics.map((m) => m.key));
    };

    const toggleDtrMetric = (metricKey) => {
        setDtrSelectedMetrics((prev) => {
            const set = new Set(prev);
            if (set.has(metricKey)) {
                if (set.size === 1) return prev;
                set.delete(metricKey);
            } else {
                set.add(metricKey);
            }
            return dtrActiveCategory.metrics.map((m) => m.key).filter((k) => set.has(k));
        });
    };

    return (
        <div className="drh-wrap">
            <div className="drh-toolbar">
                <span className="drh-toolbar-period">{periodLabel}</span>
                <button
                    type="button"
                    className={`ds-section-filter-btn${isCustom ? ' is-active' : ''}`}
                    onClick={() => setShowDrawer(true)}
                    aria-label="Pilih rentang tanggal"
                >
                    <CalendarIcon />
                </button>
            </div>

            {error ? (
                <div className="dash-alert dash-alert--danger" style={{ marginBottom: 8 }}>
                    <p className="dash-alert-body">{error}</p>
                </div>
            ) : null}

            {showDrawer ? (
                <div className="dash-drawer-overlay" onClick={() => setShowDrawer(false)}>
                    <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="dash-drawer-header">
                            <span className="dash-drawer-title">Rentang Tanggal</span>
                            <button type="button" className="dash-drawer-close" onClick={() => setShowDrawer(false)}>
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
                                    value={dateRange}
                                    onApply={handleApplyCustom}
                                    onReset={() => { setDateRange(getPresetRange('today')); setShowDrawer(false); }}
                                    loading={loading}
                                    trigger={({ open }) => {
                                        customPickerOpenRef.current = open;
                                        return <span style={{ display: 'block', height: 0, visibility: 'hidden' }} />;
                                    }}
                                />
                                <p className="dash-filter-summary" style={{ margin: '8px 0 0' }}>
                                    {loading ? 'Memuat data...' : formatRangeSummary(dateRange)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="drh-stack">
                <div className="drh-card">
                    <div className="drh-card-head">
                        <span className="drh-card-title">Database</span>
                        <span className="drh-card-total"><span className="drh-card-total-label">Total</span>{formatCount(databaseTotal)}</span>
                    </div>
                    <div className="drh-cells">
                        {databaseItems.map((it) => (
                            <div key={it.label} className="drh-cell" title={it.label}>
                                <span className="drh-cell-label">{it.short || it.label}</span>
                                <strong className="drh-cell-value">{formatCount(it.value)}</strong>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="drh-card">
                    <div className="drh-card-head">
                        <span className="drh-card-title">Visit</span>
                        <span className="drh-card-total"><span className="drh-card-total-label">Total</span>{formatCount(visitTotal)}</span>
                    </div>
                    {visitItems.length === 0 ? (
                        <span className="drh-cells-empty">
                            {loading ? 'Memuat...' : 'Belum ada group dengan sales.'}
                        </span>
                    ) : (
                        <div className="drh-cells">
                            {visitItems.map((it) => (
                                <div key={it.key} className="drh-cell" title={it.label}>
                                    <span className="drh-cell-label drh-cell-label--truncate">{it.label}</span>
                                    <strong className="drh-cell-value">{formatCount(it.value)}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="drh-card">
                    <div className="drh-card-head">
                        <span className="drh-card-title">Transaksi</span>
                        <span className="drh-card-total"><span className="drh-card-total-label">Total</span>{formatCount(transaksiTotal)}</span>
                    </div>
                    <div className="drh-cells drh-cells--cols-3">
                        {transaksiItems.map((it) => (
                            <div key={it.label} className="drh-cell" title={it.label}>
                                <span className="drh-cell-label">{it.short || it.label}</span>
                                <strong className="drh-cell-value" style={{ color: it.color }}>
                                    {formatCount(it.value)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Daily Task Recap Section ──────────────────────────────── */}
            <div className="dtr-card">
                <div className="dtr-card-head">
                    <div className="dtr-card-title-group">
                        <h3 className="dtr-card-title">Rekap Daily Task</h3>
                    </div>
                </div>

                <div className="dtr-tabs" role="tablist">
                    {DTR_CATEGORIES.map((cat) => (
                        <button
                            key={cat.key}
                            type="button"
                            role="tab"
                            aria-selected={dtrCategory === cat.key}
                            className={`dtr-tab${dtrCategory === cat.key ? ' is-active' : ''}`}
                            onClick={() => handleSelectCategory(cat.key)}
                        >
                            <span className="dtr-tab-label-full">{cat.label}</span>
                            <span className="dtr-tab-label-short">{cat.shortLabel}</span>
                        </button>
                    ))}
                </div>

                <div className="dtr-submetrics">
                    {dtrActiveCategory.metrics.map((m) => {
                        const active = dtrSelectedMetrics.includes(m.key);
                        return (
                            <button
                                key={m.key}
                                type="button"
                                className={`dtr-chip${active ? ' is-active' : ''}`}
                                onClick={() => toggleDtrMetric(m.key)}
                                style={active ? { '--dtr-chip-accent': m.accent } : undefined}
                            >
                                <span className="dtr-chip-dot" style={{ background: m.accent }} />
                                <span>{m.label}</span>
                            </button>
                        );
                    })}
                </div>

                {dailyTaskRecap.length === 0 ? (
                    <div className="dtr-empty">
                        {loading ? 'Memuat data...' : 'Belum ada data sales.'}
                    </div>
                ) : (
                    <div className="dtr-table">
                        {dailyTaskRecap.map((row) => {
                            const categoryData = row[dtrActiveCategory.key] || {};
                            const total = dtrVisibleMetrics.reduce((s, m) => s + (categoryData[m.key] || 0), 0);
                            return (
                                <div key={row.salesId} className="dtr-row">
                                    <div className="dtr-row-head">
                                        <span className="dtr-row-name">{row.salesName}</span>
                                        <span className="dtr-row-total">{formatCount(total)}</span>
                                    </div>
                                    <div
                                        className="dtr-row-cells"
                                        style={{ gridTemplateColumns: `repeat(${dtrVisibleMetrics.length}, minmax(0, 1fr))` }}
                                    >
                                        {dtrVisibleMetrics.map((m) => {
                                            const val = categoryData[m.key] || 0;
                                            return (
                                                <div key={m.key} className="dtr-row-cell" title={m.label}>
                                                    <span className="dtr-row-cell-label">{m.label}</span>
                                                    <strong className="dtr-row-cell-value" style={{ color: m.accent }}>
                                                        {formatCount(val)}
                                                    </strong>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
