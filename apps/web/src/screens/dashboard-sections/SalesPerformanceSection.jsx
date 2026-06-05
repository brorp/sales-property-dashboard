'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLeads } from '../../context/LeadsContext';
import Select from '../../components/Select';
import DateRangePicker from '../../components/DateRangePicker';
import { DATE_PRESET_OPTIONS, getPresetRange, parseDateInput } from '../../utils/datePresets';
import './DashboardSections.css';

const DEFAULT_METRICS = ['database', 'visit', 'transaksi'];

function pctStr(n) {
    return `${Number(n || 0).toFixed(1)}%`;
}

function formatRangeButtonLabel(range) {
    if (!range?.dateFrom && !range?.dateTo) return 'Kustom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Kustom';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function buildQuery(range, source) {
    const params = new URLSearchParams();
    if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
    if (range?.dateTo) params.set('dateTo', range.dateTo);
    const src = String(source || '').trim();
    if (src && src !== 'all') params.set('source', src);
    const q = params.toString();
    return q ? `?${q}` : '';
}

function MetricBar({ label, kind, count, pct }) {
    const textCls = kind === 'survey' ? 'text-survey' : kind === 'hot' ? 'text-hot-metric' : `text-${kind}`;
    return (
        <div className="ov-rank-metric-group">
            <div className="ov-rank-metric-meta">
                <span className={`ov-rank-metric-name ${textCls}`}>{label}</span>
                <span className="ov-rank-count">{count}</span>
                <span className={`ov-rank-pct ov-rank-pct--${kind} ${pct === 0 ? 'ov-rank-pct--zero' : ''}`}>
                    {pctStr(pct)}
                </span>
            </div>
            <div className="ov-rank-track">
                <div className={`ov-rank-fill ov-rank-fill--${kind}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function SalesPerformanceSection({ user }) {
    const { leadSources } = useLeads();

    const [dateRange, setDateRange] = useState(() => getPresetRange('thisMonth'));
    const [sourceFilter, setSourceFilter] = useState('all');
    const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_METRICS);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const customPickerOpenRef = useRef(null);

    const fetchData = useCallback(async (range, source) => {
        if (!user) return;
        setLoading(true);
        setError('');
        try {
            const result = await apiRequest(
                `/api/dashboard/home-analytics${buildQuery(range, source)}`,
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
        void fetchData(dateRange, sourceFilter);
    }, [fetchData, dateRange, sourceFilter]);

    const sourceOptions = useMemo(() => {
        const arr = Array.isArray(leadSources) ? leadSources : [];
        const seen = new Set();
        const list = [];
        for (const item of arr) {
            const value = String(item?.value || item?.label || item?.name || '').trim();
            if (!value) continue;
            const key = value.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            list.push(value);
        }
        list.sort((a, b) => a.localeCompare(b));
        return [
            { value: 'all', label: 'Semua Sumber' },
            ...list.map((v) => ({ value: v, label: v })),
        ];
    }, [leadSources]);

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
        if (v === 'custom') {
            customPickerOpenRef.current?.();
            return;
        }
        setDateRange(getPresetRange(v));
    };

    const transactionRecap = data?.transactionRecap;
    const totalLeads = data?.surveyRatio?.totalLeads || 0;

    const teams = useMemo(
        () => (transactionRecap?.teams || []).filter((t) => (t.prospek || 0) > 0),
        [transactionRecap],
    );

    const allSalesData = useMemo(() => {
        const list = [];
        const seen = new Set();
        for (const team of teams) {
            for (const s of (team.sales || [])) {
                if (seen.has(s.salesId)) continue;
                seen.add(s.salesId);
                const closing = (s.fullBook || 0) + (s.akad || 0);
                const prospek = s.prospek || 0;
                list.push({
                    salesId: s.salesId,
                    salesName: s.salesName,
                    prospek,
                    survey: s.survey || 0,
                    hot: s.hot || 0,
                    closing,
                    databasePct: totalLeads > 0 ? (prospek / totalLeads) * 100 : 0,
                    surveyPct: prospek > 0 ? ((s.survey || 0) / prospek) * 100 : 0,
                    closingPct: prospek > 0 ? (closing / prospek) * 100 : 0,
                    hotPct: prospek > 0 ? ((s.hot || 0) / prospek) * 100 : 0,
                });
            }
        }
        if (list.length === 0 && data?.perAgentSurveyRatio?.length) {
            for (const s of data.perAgentSurveyRatio) {
                const prospek = s.totalLeads || 0;
                list.push({
                    salesId: s.salesId,
                    salesName: s.salesName,
                    prospek,
                    survey: s.surveyedLeads || 0,
                    hot: 0,
                    closing: 0,
                    databasePct: totalLeads > 0 ? (prospek / totalLeads) * 100 : 0,
                    surveyPct: s.ratioPercent || 0,
                    closingPct: 0,
                    hotPct: 0,
                });
            }
        }
        return list;
    }, [teams, data?.perAgentSurveyRatio, totalLeads]);

    const sortedSales = useMemo(() => {
        const list = [...allSalesData];
        const primary = selectedMetrics[0] || 'visit';
        list.sort((a, b) => {
            let valA = 0;
            let valB = 0;
            if (primary === 'database') { valA = a.databasePct; valB = b.databasePct; }
            else if (primary === 'visit') { valA = a.surveyPct; valB = b.surveyPct; }
            else if (primary === 'transaksi') { valA = a.closingPct; valB = b.closingPct; }
            else if (primary === 'hot') { valA = a.hotPct; valB = b.hotPct; }
            if (valB !== valA) return valB - valA;
            return a.salesName.localeCompare(b.salesName);
        });
        return list;
    }, [allSalesData, selectedMetrics]);

    return (
        <div className="ov-wrap">
            <div className="ov-card ov-card--sales-performance">
                <div className="ov-card-head ov-card-head--sales">
                    <div className="ov-card-title-group">
                        <span className="ov-eyebrow">Performa Sales</span>
                        <h3 className="ov-card-title">Tingkat Survey per Sales</h3>
                    </div>
                    <div className="ov-card-select-wrap">
                        <Select
                            options={[
                                { value: 'database', label: 'Database' },
                                { value: 'visit', label: 'Visit' },
                                { value: 'transaksi', label: 'Transaksi' },
                                { value: 'hot', label: 'Hot Prospek' },
                            ]}
                            value={selectedMetrics}
                            onChange={(val) => { if (val && val.length > 0) setSelectedMetrics(val); }}
                            multiple
                            placeholder="Pilih metrik..."
                            clearable={false}
                            maxDisplayed={2}
                        />
                    </div>
                </div>

                <div className="sps-filter-row">
                    <div className="sps-filter-field">
                        <span className="sps-filter-label">Tanggal</span>
                        <Select
                            options={periodOptions}
                            value={activePeriodKey}
                            onChange={handlePeriodChange}
                            placeholder="Pilih Periode"
                            clearable={false}
                        />
                        <DateRangePicker
                            value={dateRange}
                            onApply={(range) => setDateRange({
                                dateFrom: range?.dateFrom || '',
                                dateTo: range?.dateTo || '',
                            })}
                            onReset={() => setDateRange(getPresetRange('thisMonth'))}
                            loading={loading}
                            trigger={({ open }) => {
                                customPickerOpenRef.current = open;
                                return <span style={{ display: 'block', height: 0, visibility: 'hidden' }} />;
                            }}
                        />
                    </div>
                    <div className="sps-filter-field">
                        <span className="sps-filter-label">Sumber</span>
                        <Select
                            options={sourceOptions}
                            value={sourceFilter}
                            onChange={(v) => setSourceFilter(v || 'all')}
                            placeholder="Semua Sumber"
                            clearable={false}
                        />
                    </div>
                </div>

                {error ? (
                    <div className="dash-alert dash-alert--danger" style={{ marginBottom: 12 }}>
                        <p className="dash-alert-body">{error}</p>
                    </div>
                ) : null}

                {loading && sortedSales.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Memuat data...
                    </div>
                ) : null}

                {!loading && sortedSales.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Belum ada data sales untuk filter ini.
                    </div>
                ) : null}

                {selectedMetrics.length > 1 && sortedSales.length > 0 ? (
                    <div className="ov-rank-headers">
                        <span className="ov-rank-header-label">Nama Sales</span>
                        <span className="ov-rank-header-label">Detail Performa</span>
                    </div>
                ) : null}

                <div className="ov-rank-table">
                    {sortedSales.map((agent) => {
                        if (selectedMetrics.length > 1) {
                            return (
                                <div key={agent.salesId} className="ov-rank-table-item-split">
                                    <div className="ov-rank-sales-name-col">
                                        <span className="ov-rank-label" style={{ fontWeight: 600 }}>
                                            {agent.salesName}
                                        </span>
                                    </div>
                                    <div className="ov-rank-metrics-stack">
                                        {selectedMetrics.includes('database') ? (
                                            <MetricBar label="Database" kind="database" count={`${agent.prospek}/${totalLeads}`} pct={agent.databasePct} />
                                        ) : null}
                                        {selectedMetrics.includes('visit') ? (
                                            <MetricBar label="Visit" kind="survey" count={`${agent.survey}/${agent.prospek}`} pct={agent.surveyPct} />
                                        ) : null}
                                        {selectedMetrics.includes('transaksi') ? (
                                            <MetricBar label="Transaksi" kind="transaksi" count={`${agent.closing}/${agent.prospek}`} pct={agent.closingPct} />
                                        ) : null}
                                        {selectedMetrics.includes('hot') ? (
                                            <MetricBar label="Hot Prospek" kind="hot" count={`${agent.hot}/${agent.prospek}`} pct={agent.hotPct} />
                                        ) : null}
                                    </div>
                                </div>
                            );
                        }

                        const single = selectedMetrics[0] || 'visit';
                        let countLabel = '';
                        let pctValue = 0;
                        let fillClass = 'ov-rank-fill--survey';
                        if (single === 'database') {
                            countLabel = `${agent.prospek}/${totalLeads}`;
                            pctValue = agent.databasePct;
                            fillClass = 'ov-rank-fill--database';
                        } else if (single === 'visit') {
                            countLabel = `${agent.survey}/${agent.prospek}`;
                            pctValue = agent.surveyPct;
                            fillClass = 'ov-rank-fill--survey';
                        } else if (single === 'transaksi') {
                            countLabel = `${agent.closing}/${agent.prospek}`;
                            pctValue = agent.closingPct;
                            fillClass = 'ov-rank-fill--transaksi';
                        } else if (single === 'hot') {
                            countLabel = `${agent.hot}/${agent.prospek}`;
                            pctValue = agent.hotPct;
                            fillClass = 'ov-rank-fill--hot';
                        }

                        return (
                            <div key={agent.salesId} className="ov-rank-table-item">
                                <div className="ov-rank-row" style={{ padding: 0, border: 'none' }}>
                                    <span className="ov-rank-label">{agent.salesName}</span>
                                    <span className="ov-rank-count">{countLabel}</span>
                                    <span className={`ov-rank-pct${pctValue === 0 ? ' ov-rank-pct--zero' : ''}`}>
                                        {pctStr(pctValue)}
                                    </span>
                                </div>
                                <div className="ov-rank-track">
                                    <div className={`ov-rank-fill ${fillClass}`} style={{ width: `${pctValue}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
