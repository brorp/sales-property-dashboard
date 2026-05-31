import { useMemo, useState } from 'react';
import { formatCount } from './utils';
import PieChartCard from '../../components/PieChartCard';
import './DashboardSections.css';

const PIE_COLORS = [
    '#7C3AED', // purple
    '#22C55E', // green
    '#F97316', // orange
    '#0EA5E9', // sky blue
    '#EF4444', // red
    '#14B8A6', // teal
    '#EC4899', // pink
    '#EAB308', // yellow
];

const L4_STATUSES = [
    { key: 'lunas', label: 'Lunas', color: 'var(--green)' },
    { key: 'full_book', label: 'Full Book', color: 'var(--purple)' },
    { key: 'reserve', label: 'Reserve', color: 'var(--info)' },
    { key: 'cancel_full_book', label: 'Cancel Full Book', color: 'var(--danger)' },
    { key: 'cancel_reserve', label: 'Cancel Reserve', color: '#F97316' },
    { key: 'cancel_minat', label: 'Cancel Minat', color: '#EC4899' },
];

const L3_STATUSES = [
    { key: 'sudah_survey', label: 'Sudah Survey', color: 'var(--survey)' },
    { key: 'mau_survey', label: 'Mau Survey', color: 'var(--warm)' },
    { key: 'dibatalkan', label: 'Batal Survey', color: 'var(--danger)' },
];

const L2_STATUSES = [
    { key: 'hot_validated', label: 'Hot Validated', color: '#A855F7' },
    { key: 'hot', label: 'Hot', color: 'var(--hot)' },
    { key: 'warm', label: 'Warm', color: 'var(--warm)' },
    { key: 'cold', label: 'Cold', color: 'var(--cold)' },
    { key: 'no_response', label: 'No Response', color: '#64748B' },
    { key: 'error', label: 'Error', color: '#BE123C' },
    { key: 'skip', label: 'Skip', color: '#0F766E' },
];

function toLowerTrimmed(value) {
    return String(value || '').trim().toLowerCase();
}

function getResultStatusKey(resultStatus) {
    const v = toLowerTrimmed(resultStatus);
    if (!v) return null;
    if (v === 'on_process') return 'reserve';
    if (v === 'akad') return 'lunas';
    if (v === 'cancel' || v === 'cancel_transaksi' || v === 'cancel_full_book') return 'cancel_full_book';
    if (v === 'cancel_reserve') return 'cancel_reserve';
    if (v === 'cancel_minat') return 'cancel_minat';
    if (v === 'lunas' || v === 'full_book' || v === 'reserve') return v;
    return null;
}

function isL4Reached(lead) {
    return getResultStatusKey(lead.resultStatus) !== null;
}

function isL3Reached(lead) {
    const tag = toLowerTrimmed(lead.appointmentTag);
    return tag && tag !== 'none';
}

function isL2Reached(lead) {
    return getL2BucketKey(lead) !== null;
}

function getL4BucketKey(resultStatus) {
    const k = getResultStatusKey(resultStatus);
    if (k === 'lunas' || k === 'full_book' || k === 'reserve') return k;
    if (k === 'cancel_full_book' || k === 'cancel_reserve' || k === 'cancel_minat') return k;
    return null;
}

function getL3BucketKey(appointmentTag) {
    const t = toLowerTrimmed(appointmentTag);
    if (t === 'sudah_survey' || t === 'mau_survey' || t === 'dibatalkan') return t;
    return null;
}

function getL2BucketKey(lead) {
    const s = toLowerTrimmed(lead.salesStatus);
    if (s === 'hot' && lead.validated) return 'hot_validated';
    if (s === 'hot' || s === 'warm' || s === 'cold' || s === 'no_response' || s === 'error' || s === 'skip') return s;
    return null;
}

function isCancelLead(lead) {
    const v = toLowerTrimmed(lead.resultStatus);
    return (
        v === 'cancel' ||
        v === 'cancel_transaksi' ||
        v === 'cancel_full_book' ||
        v === 'cancel_reserve' ||
        v === 'cancel_minat'
    );
}

function parseInputDate(value) {
    if (!value) return null;
    const dt = new Date(`${value}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseInputDateEnd(value) {
    if (!value) return null;
    const dt = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function withinRange(dateValue, start, end) {
    if (!dateValue) return false;
    const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(dt.getTime())) return false;
    if (start && dt.getTime() < start.getTime()) return false;
    if (end && dt.getTime() > end.getTime()) return false;
    return true;
}

function pct(n, d) {
    if (!d || d <= 0) return 0;
    return Math.round((n / d) * 10000) / 100;
}

function makeUnitLabelResolver(unitIdToLabel) {
    return (lead) => {
        if (lead.interestUnitId && unitIdToLabel.has(lead.interestUnitId)) {
            return unitIdToLabel.get(lead.interestUnitId);
        }
        // Fallback chain: prefer concrete unit name (e.g. "L4"), then projectType,
        // skipping placeholder "-" values.
        const candidates = [lead.interestUnitName, lead.interestProjectType, lead.unitName];
        for (const c of candidates) {
            const v = String(c || '').trim();
            if (v && v !== '-') return v;
        }
        return 'Belum Diisi';
    };
}

function getDomicileLabel(lead) {
    return lead.domicileCity || 'Belum Diisi';
}

function getSourceLabel(lead) {
    return lead.source || 'Lainnya';
}

function makeCancelReasonResolver(codeToLabel) {
    return (lead) => {
        const code = lead.rejectedReason;
        if (!code) return 'Lainnya';
        return codeToLabel.get(code) || code;
    };
}

function buildBreakdown(leads, getLabel, limit = 8) {
    const map = new Map();
    for (const item of leads) {
        const label = getLabel(item);
        if (!label) continue;
        map.set(label, (map.get(label) || 0) + 1);
    }
    const sorted = Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    if (sorted.length <= limit) return sorted;
    const top = sorted.slice(0, limit - 1);
    const rest = sorted.slice(limit - 1);
    const restTotal = rest.reduce((s, item) => s + item.count, 0);
    return [...top, { label: 'Lainnya', count: restTotal }];
}

function StatusRow({ status, count, total, active, onClick, disabled }) {
    const percent = pct(count, total);
    const className = [
        'an-status-row',
        active ? 'is-active' : '',
        disabled ? 'is-disabled' : '',
    ].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            className={className}
            onClick={onClick}
            disabled={disabled}
            style={{ '--an-status-color': status.color }}
        >
            <span className="an-status-row-label">
                <span className="an-status-dot" style={{ background: status.color }} />
                <span>{status.label}</span>
            </span>
            <span className="an-status-row-meta">
                <strong className="an-status-count">{formatCount(count)}</strong>
                <span className="an-status-pct">{percent}%</span>
            </span>
            <span className="an-status-track">
                <span className="an-status-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: status.color }} />
            </span>
        </button>
    );
}

function ColumnCard({ title, total, rateLabel, rateValue, children }) {
    return (
        <div className="an-col-card">
            <div className="an-col-card-head">
                <h4 className="an-col-card-title">{title}</h4>
                <div className="an-col-card-total">
                    <span className="an-col-card-total-label">Total</span>
                    <strong className="an-col-card-total-value">{formatCount(total)}</strong>
                </div>
            </div>
            <div className="an-col-card-body">{children}</div>
            {rateLabel ? (
                <div className="an-col-card-foot">
                    <span className="an-col-card-foot-label">{rateLabel}</span>
                    <strong className="an-col-card-foot-value">{rateValue}%</strong>
                </div>
            ) : null}
        </div>
    );
}

function PieIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
    );
}

function BarIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

function BarChartCard({ title, subtitle, total, items, emptyLabel }) {
    const chartItems = items.filter((item) => item.count > 0);
    return (
        <div className="pcc">
            <div className="pcc-header">
                <div className="pcc-header-top">
                    <h4 className="pcc-title">{title}</h4>
                </div>
                {subtitle ? <span className="pcc-subtitle">{subtitle}</span> : null}
            </div>
            {chartItems.length === 0 ? (
                <div className="pcc-empty">{emptyLabel}</div>
            ) : (
                <div className="dcc-bar-list">
                    {chartItems.map((item) => {
                        const percent = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                        return (
                            <div key={item.label} className="dcc-bar-item">
                                <div className="dcc-bar-item-row">
                                    <span className="dcc-bar-dot" style={{ background: item.color }} />
                                    <span className="dcc-bar-label">{item.label}</span>
                                    <strong className="dcc-bar-count">{formatCount(item.count)}</strong>
                                    <span className="dcc-bar-pct">{percent}%</span>
                                </div>
                                <div className="dcc-bar-track">
                                    <div className="dcc-bar-fill" style={{ width: `${Math.max(1, percent)}%`, background: item.color }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function AnalyticsSection({
    leads = [],
    transactionRecap = null,
    projectUnits = [],
    cancelReasons = [],
    appliedDateRange,
    rangeSummary = '',
    periodLabel = '',
    onOpenFilter,
    viewerRole = '',
    viewerId = '',
}) {
    const unitIdToType = useMemo(() => {
        const m = new Map();
        for (const u of projectUnits) {
            if (!u?.id) continue;
            const pt = String(u.projectType || '').trim();
            const un = String(u.unitName || '').trim();
            // Pick the first meaningful label: prefer projectType when it's a real
            // category, but skip placeholder "-" — many workspaces store the actual
            // type (e.g. L4/L5) in unitName instead.
            const meaningful = (pt && pt !== '-') ? pt : un;
            const label = meaningful || pt || un;
            if (label) m.set(u.id, label);
        }
        return m;
    }, [projectUnits]);

    const cancelCodeToLabel = useMemo(() => {
        const m = new Map();
        for (const r of cancelReasons) {
            if (r?.code && r?.label) m.set(r.code, r.label);
        }
        return m;
    }, [cancelReasons]);

    const getUnitLabel = useMemo(() => makeUnitLabelResolver(unitIdToType), [unitIdToType]);
    const getCancelReasonLabel = useMemo(() => makeCancelReasonResolver(cancelCodeToLabel), [cancelCodeToLabel]);

    const [selectedSalesId, setSelectedSalesId] = useState('all');
    const [statusFilter, setStatusFilter] = useState(null);
    const [chartType, setChartType] = useState('pie');

    const dateStart = useMemo(() => parseInputDate(appliedDateRange?.dateFrom), [appliedDateRange?.dateFrom]);
    const dateEnd = useMemo(() => parseInputDateEnd(appliedDateRange?.dateTo), [appliedDateRange?.dateTo]);
    const hasDateFilter = Boolean(dateStart || dateEnd);

    // Sales list flattened from analytics.transactionRecap.teams[].sales[]
    const visibleSales = useMemo(() => {
        const teams = transactionRecap?.teams || [];
        const seen = new Set();
        const out = [];
        for (const team of teams) {
            for (const s of (team.sales || [])) {
                if (!s.salesId || seen.has(s.salesId)) continue;
                if (s.salesId === 'unassigned_sales') continue;
                seen.add(s.salesId);
                out.push({ id: s.salesId, name: s.salesName });
            }
        }
        if (viewerRole === 'sales') {
            const me = out.find((s) => s.id === viewerId);
            return me ? [me] : out.filter((s) => s.id === viewerId);
        }
        out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        return out;
    }, [transactionRecap, viewerRole, viewerId]);

    // createdAt-based filter for non-Transaction views
    const createdAtFilteredLeads = useMemo(() => {
        if (!hasDateFilter) return leads;
        return leads.filter((l) => withinRange(l.createdAt || l.receivedAt, dateStart, dateEnd));
    }, [leads, hasDateFilter, dateStart, dateEnd]);

    // resultStatusUpdatedAt-based filter for Transaction column
    const l4FilteredLeads = useMemo(() => {
        if (!hasDateFilter) return leads;
        return leads.filter((l) => withinRange(l.resultStatusUpdatedAt, dateStart, dateEnd));
    }, [leads, hasDateFilter, dateStart, dateEnd]);

    const salesLeadCounts = useMemo(() => {
        const map = new Map();
        for (const l of createdAtFilteredLeads) {
            if (!l.assignedTo) continue;
            map.set(l.assignedTo, (map.get(l.assignedTo) || 0) + 1);
        }
        return map;
    }, [createdAtFilteredLeads]);

    const isAllSales = selectedSalesId === 'all';

    function applySalesFilter(items) {
        if (isAllSales) return items;
        return items.filter((l) => l.assignedTo === selectedSalesId);
    }

    const scopedCreatedAtLeads = useMemo(
        () => applySalesFilter(createdAtFilteredLeads),
        [createdAtFilteredLeads, selectedSalesId]
    );

    const scopedL4Leads = useMemo(
        () => applySalesFilter(l4FilteredLeads),
        [l4FilteredLeads, selectedSalesId]
    );

    const totalData = scopedCreatedAtLeads.length;

    const l2Reached = useMemo(() => scopedCreatedAtLeads.filter(isL2Reached), [scopedCreatedAtLeads]);
    const l2Counts = useMemo(() => {
        const m = Object.fromEntries(L2_STATUSES.map((s) => [s.key, 0]));
        for (const l of scopedCreatedAtLeads) {
            const k = getL2BucketKey(l);
            if (k && k in m) m[k] += 1;
        }
        return m;
    }, [scopedCreatedAtLeads]);

    const l3Reached = useMemo(() => scopedCreatedAtLeads.filter(isL3Reached), [scopedCreatedAtLeads]);
    const l3Counts = useMemo(() => {
        const m = { sudah_survey: 0, mau_survey: 0, dibatalkan: 0 };
        for (const l of scopedCreatedAtLeads) {
            const k = getL3BucketKey(l.appointmentTag);
            if (k) m[k] += 1;
        }
        return m;
    }, [scopedCreatedAtLeads]);

    const l4Reached = useMemo(() => scopedL4Leads.filter(isL4Reached), [scopedL4Leads]);
    const l4Counts = useMemo(() => {
        const m = Object.fromEntries(L4_STATUSES.map((s) => [s.key, 0]));
        for (const l of scopedL4Leads) {
            const k = getL4BucketKey(l.resultStatus);
            if (k && k in m) m[k] += 1;
        }
        return m;
    }, [scopedL4Leads]);

    const closingRate = pct(l4Counts.full_book, scopedL4Leads.length);
    const surveyRate = pct(l3Counts.sudah_survey, scopedCreatedAtLeads.length);
    const prospectRate = pct((l2Counts.hot || 0) + (l2Counts.hot_validated || 0), scopedCreatedAtLeads.length);

    const chartLeads = useMemo(() => {
        if (!statusFilter) return scopedCreatedAtLeads;
        const { type, key } = statusFilter;
        if (type === 'prospek') {
            return scopedCreatedAtLeads.filter((l) => getL2BucketKey(l) === key);
        }
        if (type === 'visit') {
            return scopedCreatedAtLeads.filter((l) => getL3BucketKey(l.appointmentTag) === key);
        }
        if (type === 'transaction') {
            return scopedL4Leads.filter((l) => getL4BucketKey(l.resultStatus) === key);
        }
        return scopedCreatedAtLeads;
    }, [statusFilter, scopedCreatedAtLeads, scopedL4Leads]);

    const sourceItems = useMemo(() => {
        const items = buildBreakdown(chartLeads, getSourceLabel, 8);
        return items.map((it, i) => ({ ...it, color: PIE_COLORS[i % PIE_COLORS.length] }));
    }, [chartLeads]);

    const domicileItems = useMemo(() => {
        const items = buildBreakdown(chartLeads, getDomicileLabel, 8);
        return items.map((it, i) => ({ ...it, color: PIE_COLORS[i % PIE_COLORS.length] }));
    }, [chartLeads]);

    const unitItems = useMemo(() => {
        const items = buildBreakdown(chartLeads, getUnitLabel, 8);
        return items.map((it, i) => ({ ...it, color: PIE_COLORS[i % PIE_COLORS.length] }));
    }, [chartLeads, getUnitLabel]);

    const cancelLeads = useMemo(() => chartLeads.filter(isCancelLead), [chartLeads]);
    const cancelItems = useMemo(() => {
        const items = buildBreakdown(cancelLeads, getCancelReasonLabel, 8);
        return items.map((it, i) => ({ ...it, color: PIE_COLORS[i % PIE_COLORS.length] }));
    }, [cancelLeads, getCancelReasonLabel]);

    function toggleStatusFilter(type, key) {
        setStatusFilter((prev) => {
            if (prev && prev.type === type && prev.key === key) return null;
            return { type, key };
        });
    }

    const isStatusActive = (type, key) => statusFilter?.type === type && statusFilter?.key === key;

    const activeStatusBadge = useMemo(() => {
        if (!statusFilter) return null;
        if (statusFilter.type === 'transaction') {
            return L4_STATUSES.find((s) => s.key === statusFilter.key)?.label || statusFilter.key;
        }
        if (statusFilter.type === 'visit') {
            return L3_STATUSES.find((s) => s.key === statusFilter.key)?.label || statusFilter.key;
        }
        if (statusFilter.type === 'prospek') {
            return L2_STATUSES.find((s) => s.key === statusFilter.key)?.label || statusFilter.key;
        }
        return null;
    }, [statusFilter]);

    const chartCards = [
        { title: 'Sumber', subtitle: 'Distribusi source leads.', items: sourceItems, emptyLabel: 'Belum ada data source.' },
        { title: 'Domisili', subtitle: 'Distribusi domisili leads.', items: domicileItems, emptyLabel: 'Belum ada data domisili.' },
        { title: 'Produk', subtitle: 'Distribusi tipe unit yang diminati.', items: unitItems, emptyLabel: 'Belum ada data tipe unit.' },
        { title: 'Alasan Batal', subtitle: 'Distribusi alasan cancel.', items: cancelItems, emptyLabel: 'Belum ada data alasan batal.' },
    ];

    return (
        <div className="ds-card an-section">
            <div className="ds-card-head an-head">
                <div>
                    <div className="an-head-title-row">
                        <h2 className="ds-card-title">Analitik</h2>
                        {periodLabel ? <span className="tpc-period-badge">{periodLabel}</span> : null}
                    </div>
                    <span className="ds-card-summary">{rangeSummary || 'Klik status untuk memfilter grafik di bawah.'}</span>
                </div>
                {onOpenFilter ? (
                    <button type="button" className="ds-section-filter-btn" onClick={onOpenFilter} aria-label="Pilih rentang tanggal">
                        <CalendarIcon />
                    </button>
                ) : null}
            </div>

            <div className="ds-tab-body an-body">
                <div className="an-grid">
                    {/* Left column: Total Data + sales picker */}
                    <div className="an-sales-pane">
                        <button
                            type="button"
                            className={`an-sales-row an-sales-row--total${isAllSales ? ' is-active' : ''}`}
                            onClick={() => setSelectedSalesId('all')}
                        >
                            <span className="an-sales-row-label">Semua</span>
                            <strong className="an-sales-row-count">{formatCount(totalData)}</strong>
                        </button>
                        <div className="an-sales-list">
                            {visibleSales.length === 0 ? (
                                <div className="an-sales-empty">Tidak ada sales</div>
                            ) : visibleSales.map((s) => {
                                const count = salesLeadCounts.get(s.id) || 0;
                                const active = selectedSalesId === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className={`an-sales-row${active ? ' is-active' : ''}`}
                                        onClick={() => setSelectedSalesId(active ? 'all' : s.id)}
                                        title={s.name}
                                    >
                                        <span className="an-sales-row-label">{s.name}</span>
                                        <strong className="an-sales-row-count">{formatCount(count)}</strong>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right side: 3 columns */}
                    <div className="an-cols">
                        <ColumnCard
                            title="Transaction"
                            total={l4Reached.length}
                            rateLabel="Closing Rate"
                            rateValue={closingRate}
                        >
                            {L4_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l4Counts[status.key] || 0}
                                    total={l4Reached.length}
                                    active={isStatusActive('transaction', status.key)}
                                    onClick={() => toggleStatusFilter('transaction', status.key)}
                                />
                            ))}
                        </ColumnCard>

                        <ColumnCard
                            title="Visit"
                            total={l3Reached.length}
                            rateLabel="Survey Rate"
                            rateValue={surveyRate}
                        >
                            {L3_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l3Counts[status.key] || 0}
                                    total={l3Reached.length}
                                    active={isStatusActive('visit', status.key)}
                                    onClick={() => toggleStatusFilter('visit', status.key)}
                                />
                            ))}
                        </ColumnCard>

                        <ColumnCard
                            title="Status Prospek"
                            total={l2Reached.length}
                            rateLabel="Prospect Rate"
                            rateValue={prospectRate}
                        >
                            {L2_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l2Counts[status.key] || 0}
                                    total={l2Reached.length}
                                    active={isStatusActive('prospek', status.key)}
                                    onClick={() => toggleStatusFilter('prospek', status.key)}
                                />
                            ))}
                        </ColumnCard>
                    </div>
                </div>

                {/* Bottom charts */}
                <div className="an-charts-head">
                    <div>
                        <h3 className="an-charts-title">Distribusi Data</h3>
                        <span className="an-charts-sub">
                            {statusFilter
                                ? `Filter aktif: ${activeStatusBadge}`
                                : 'Klik status di atas untuk memfilter grafik di bawah.'}
                        </span>
                    </div>
                    <div className="an-charts-controls">
                        <div className="dcc-chart-toggle">
                            <button
                                type="button"
                                className={`dcc-chart-toggle-btn${chartType === 'pie' ? ' active' : ''}`}
                                onClick={() => setChartType('pie')}
                            >
                                <PieIcon /> Pie
                            </button>
                            <button
                                type="button"
                                className={`dcc-chart-toggle-btn${chartType === 'bar' ? ' active' : ''}`}
                                onClick={() => setChartType('bar')}
                            >
                                <BarIcon /> Bar
                            </button>
                        </div>
                        {statusFilter ? (
                            <button type="button" className="an-charts-clear" onClick={() => setStatusFilter(null)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span>Reset</span>
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="an-charts-grid">
                    {chartCards.map(({ title, subtitle, items, emptyLabel }) => {
                        const total = items.reduce((s, i) => s + i.count, 0);
                        if (chartType === 'bar') {
                            return (
                                <BarChartCard
                                    key={title}
                                    title={title}
                                    subtitle={subtitle}
                                    total={total}
                                    items={items}
                                    emptyLabel={emptyLabel}
                                />
                            );
                        }
                        return (
                            <PieChartCard
                                key={title}
                                title={title}
                                subtitle={subtitle}
                                total={total}
                                items={items}
                                emptyLabel={emptyLabel}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
