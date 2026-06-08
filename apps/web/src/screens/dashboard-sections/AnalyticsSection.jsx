import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCount } from './utils';
import PieChartCard from '../../components/PieChartCard';
import Select from '../../components/Select';
import DateRangePicker from '../../components/DateRangePicker';
import { DATE_PRESET_OPTIONS, getPresetRange, parseDateInput } from '../../utils/datePresets';
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
    { key: 'no_response_error', label: 'No Response / Error', color: '#64748B' },
    { key: 'skip', label: 'Skip', color: '#0F766E' },
    { key: 'cancel_minat', label: 'Cancel Minat', color: '#EC4899' },
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
    if (k === 'cancel_full_book' || k === 'cancel_reserve') return k;
    return null;
}

function getL3BucketKey(appointmentTag) {
    const t = toLowerTrimmed(appointmentTag);
    if (t === 'sudah_survey' || t === 'mau_survey' || t === 'dibatalkan') return t;
    return null;
}

function getL2BucketKey(lead) {
    if (toLowerTrimmed(lead.resultStatus) === 'cancel_minat') return 'cancel_minat';
    const s = toLowerTrimmed(lead.salesStatus);
    if (s === 'hot' && lead.validated) return 'hot_validated';
    if (s === 'no_response' || s === 'error') return 'no_response_error';
    if (s === 'hot' || s === 'warm' || s === 'cold' || s === 'skip') return s;
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

function formatFormulaDetail(parts, total) {
    const leftSide = parts.map((value) => formatCount(value)).join(' + ');
    return `${parts.length > 1 ? `(${leftSide})` : leftSide} / ${formatCount(total)}`;
}

function getSalesNameForLead(lead, salesNameById) {
    if (lead.assignedTo && salesNameById.has(lead.assignedTo)) {
        return salesNameById.get(lead.assignedTo);
    }
    return lead.assignedUserName || (lead.assignedTo ? 'Sales Tanpa Nama' : 'Unassigned');
}

function buildStatusSalesBreakdown(items, matcher, salesNameById, limit = 6) {
    const map = new Map();
    for (const item of items) {
        if (!matcher(item)) continue;
        const salesKey = item.assignedTo || 'unassigned';
        const current = map.get(salesKey) || {
            salesId: salesKey,
            salesName: getSalesNameForLead(item, salesNameById),
            count: 0,
        };
        current.count += 1;
        map.set(salesKey, current);
    }

    const sorted = Array.from(map.values())
        .sort((a, b) => b.count - a.count || a.salesName.localeCompare(b.salesName));

    return {
        total: sorted.reduce((sum, item) => sum + item.count, 0),
        items: sorted.slice(0, limit),
        hiddenCount: Math.max(0, sorted.length - limit),
    };
}

function StatusTooltip({ status, breakdown }) {
    if (!breakdown) return null;
    return (
        <span className="an-status-tooltip" role="tooltip">
            <span className="an-status-tooltip-title">{status.label}</span>
            {breakdown.items.length > 0 ? (
                <span className="an-status-tooltip-list">
                    {breakdown.items.map((item) => (
                        <span key={item.salesId} className="an-status-tooltip-row">
                            <span className="an-status-tooltip-name">{item.salesName}</span>
                            <strong className="an-status-tooltip-count">{formatCount(item.count)}</strong>
                        </span>
                    ))}
                    {breakdown.hiddenCount > 0 ? (
                        <span className="an-status-tooltip-more">+{breakdown.hiddenCount} sales lainnya</span>
                    ) : null}
                </span>
            ) : (
                <span className="an-status-tooltip-empty">Belum ada sales</span>
            )}
        </span>
    );
}

function StatusRow({ status, count, total, active, onClick, disabled, salesBreakdown }) {
    const percent = pct(count, total);
    const className = [
        'an-status-row',
        active ? 'is-active' : '',
        disabled ? 'is-disabled' : '',
        salesBreakdown ? 'has-tooltip' : '',
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
            <StatusTooltip status={status} breakdown={salesBreakdown} />
        </button>
    );
}

function ColumnCard({ title, total, rateLabel, rateValue, rateFormula, rateFormulaDetail, children }) {
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
                <div className="an-col-card-foot" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="an-col-card-foot-label">
                            {rateLabel} : {rateFormula ? `(${rateFormula})` : ''}
                            {rateFormulaDetail ? <span className="an-col-card-foot-detail"> = {rateFormulaDetail}</span> : null}
                        </span>
                        <strong className="an-col-card-foot-value">{rateValue}%</strong>
                    </div>

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

function formatRangeButtonLabel(range) {
    if (!range?.dateFrom && !range?.dateTo) return 'Kustom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Kustom';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export default function AnalyticsSection({
    leads = [],
    transactionRecap = null,
    projectUnits = [],
    cancelReasons = [],
    appliedDateRange,
    rangeSummary = '',
    onDateRangeChange,
    sourceOptions = [],
    selectedSource = 'all',
    onSourceChange,
    viewerRole = '',
    viewerId = '',
}) {
    const datePickerOpenRef = useRef(null);

    const isCustomPeriod = !DATE_PRESET_OPTIONS.some((r) => {
        const pr = getPresetRange(r.value);
        return pr.dateFrom === appliedDateRange?.dateFrom && pr.dateTo === appliedDateRange?.dateTo;
    });
    const activePeriodKey = isCustomPeriod
        ? 'custom'
        : (DATE_PRESET_OPTIONS.find((r) => {
            const pr = getPresetRange(r.value);
            return pr.dateFrom === appliedDateRange?.dateFrom && pr.dateTo === appliedDateRange?.dateTo;
        })?.value ?? '');

    const periodOptions = useMemo(() => [
        ...DATE_PRESET_OPTIONS.map(({ value, label }) => ({ value, label })),
        { value: 'custom', label: isCustomPeriod ? formatRangeButtonLabel(appliedDateRange) : 'Rentang Kustom' },
    ], [isCustomPeriod, appliedDateRange]);

    const handlePeriodChange = (v) => {
        if (!v || !onDateRangeChange) return;
        if (v === 'custom') { datePickerOpenRef.current?.(); return; }
        onDateRangeChange(getPresetRange(v));
    };

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
    const [selectedGroupId, setSelectedGroupId] = useState('all');
    const [statusFilter, setStatusFilter] = useState(null);
    const [chartType, setChartType] = useState('pie');
    const [isSalesListOpen, setIsSalesListOpen] = useState(false);
    const salesPaneRef = useRef(null);

    const groupOptions = useMemo(() => {
        const comparisonGroups = Array.isArray(transactionRecap?.comparisonGroups) ? transactionRecap.comparisonGroups : [];
        return comparisonGroups
            .filter((g) => (g.salesCount || 0) > 0)
            .map((g) => ({ id: g.id, name: g.name || 'Tanpa Nama', salesIds: Array.isArray(g.salesIds) ? g.salesIds : [] }));
    }, [transactionRecap]);

    const groupSalesIdsSet = useMemo(() => {
        if (selectedGroupId === 'all') return null;
        const opt = groupOptions.find((g) => g.id === selectedGroupId);
        return opt ? new Set(opt.salesIds) : new Set();
    }, [selectedGroupId, groupOptions]);

    // If selected sales no longer belongs to selected group, reset to 'all'
    useEffect(() => {
        if (!groupSalesIdsSet) return;
        if (selectedSalesId !== 'all' && !groupSalesIdsSet.has(selectedSalesId)) {
            setSelectedSalesId('all');
        }
    }, [groupSalesIdsSet, selectedSalesId]);

    const dateStart = useMemo(() => parseInputDate(appliedDateRange?.dateFrom), [appliedDateRange?.dateFrom]);
    const dateEnd = useMemo(() => parseInputDateEnd(appliedDateRange?.dateTo), [appliedDateRange?.dateTo]);
    const hasDateFilter = Boolean(dateStart || dateEnd);

    useEffect(() => {
        if (!isSalesListOpen) return;
        const handlePointerDown = (event) => {
            if (salesPaneRef.current && !salesPaneRef.current.contains(event.target)) {
                setIsSalesListOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isSalesListOpen]);

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
        const filtered = groupSalesIdsSet
            ? out.filter((s) => groupSalesIdsSet.has(s.id))
            : out;
        filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        return filtered;
    }, [transactionRecap, viewerRole, viewerId, groupSalesIdsSet]);

    const salesNameById = useMemo(() => {
        const map = new Map();
        for (const item of visibleSales) {
            if (item.id) map.set(item.id, item.name || 'Sales Tanpa Nama');
        }
        return map;
    }, [visibleSales]);

    const sourceFilteredLeads = useMemo(() => {
        const sourceValues = Array.isArray(selectedSource)
            ? selectedSource
            : (selectedSource && selectedSource !== 'all' ? [selectedSource] : []);
        const normalizedSources = sourceValues
            .map((value) => toLowerTrimmed(value))
            .filter((value) => value && value !== 'all');
        if (normalizedSources.length === 0) return leads;
        const sourceSet = new Set(normalizedSources);
        return leads.filter((lead) => sourceSet.has(toLowerTrimmed(getSourceLabel(lead))));
    }, [leads, selectedSource]);

    const selectedSourceValues = useMemo(() => {
        const values = Array.isArray(selectedSource)
            ? selectedSource
            : (selectedSource && selectedSource !== 'all' ? [selectedSource] : []);
        return values.filter((value) => value && value !== 'all');
    }, [selectedSource]);

    const sourceFilterOptions = useMemo(
        () => sourceOptions.filter((option) => option.value !== 'all'),
        [sourceOptions]
    );

    // createdAt-based filter for non-Transaction views
    const createdAtFilteredLeads = useMemo(() => {
        if (!hasDateFilter) return sourceFilteredLeads;
        return sourceFilteredLeads.filter((l) => withinRange(l.createdAt || l.receivedAt, dateStart, dateEnd));
    }, [sourceFilteredLeads, hasDateFilter, dateStart, dateEnd]);

    // appointment.date-based filter for Visit (Survey) column.
    const surveyDateFilteredLeads = useMemo(() => {
        if (!hasDateFilter) return sourceFilteredLeads;
        return sourceFilteredLeads.filter((l) => {
            const surveyDate = l.latestAppointment?.date;
            if (!surveyDate) return false;
            return withinRange(`${surveyDate}T00:00:00`, dateStart, dateEnd);
        });
    }, [sourceFilteredLeads, hasDateFilter, dateStart, dateEnd]);

    // resultStatusUpdatedAt-based filter for Transaction column
    const l4FilteredLeads = useMemo(() => {
        if (!hasDateFilter) return sourceFilteredLeads;
        return sourceFilteredLeads.filter((l) => withinRange(l.resultStatusUpdatedAt, dateStart, dateEnd));
    }, [sourceFilteredLeads, hasDateFilter, dateStart, dateEnd]);

    const salesLeadCounts = useMemo(() => {
        const map = new Map();
        for (const l of createdAtFilteredLeads) {
            if (!l.assignedTo) continue;
            map.set(l.assignedTo, (map.get(l.assignedTo) || 0) + 1);
        }
        return map;
    }, [createdAtFilteredLeads]);

    const totalDatabaseCount = useMemo(() => {
        if (!groupSalesIdsSet) return createdAtFilteredLeads.length;
        let n = 0;
        for (const l of createdAtFilteredLeads) {
            if (l.assignedTo && groupSalesIdsSet.has(l.assignedTo)) n += 1;
        }
        return n;
    }, [createdAtFilteredLeads, groupSalesIdsSet]);

    const isAllSales = selectedSalesId === 'all';

    function applySalesFilter(items) {
        if (!isAllSales) {
            return items.filter((l) => l.assignedTo === selectedSalesId);
        }
        if (groupSalesIdsSet) {
            return items.filter((l) => l.assignedTo && groupSalesIdsSet.has(l.assignedTo));
        }
        return items;
    }

    const scopedCreatedAtLeads = useMemo(
        () => applySalesFilter(createdAtFilteredLeads),
        [createdAtFilteredLeads, selectedSalesId, groupSalesIdsSet]
    );

    const scopedSurveyDateLeads = useMemo(
        () => applySalesFilter(surveyDateFilteredLeads),
        [surveyDateFilteredLeads, selectedSalesId, groupSalesIdsSet]
    );

    const scopedL4Leads = useMemo(
        () => applySalesFilter(l4FilteredLeads),
        [l4FilteredLeads, selectedSalesId, groupSalesIdsSet]
    );

    const l2Reached = useMemo(() => scopedCreatedAtLeads.filter(isL2Reached), [scopedCreatedAtLeads]);
    const l2Counts = useMemo(() => {
        const m = Object.fromEntries(L2_STATUSES.map((s) => [s.key, 0]));
        for (const l of scopedCreatedAtLeads) {
            const k = getL2BucketKey(l);
            if (k && k in m) m[k] += 1;
        }
        return m;
    }, [scopedCreatedAtLeads]);


    const l3Reached = useMemo(() => scopedSurveyDateLeads.filter(isL3Reached), [scopedSurveyDateLeads]);
    const l3Counts = useMemo(() => {
        const m = { sudah_survey: 0, mau_survey: 0, dibatalkan: 0 };
        for (const l of scopedSurveyDateLeads) {
            const k = getL3BucketKey(l.appointmentTag);
            if (k) m[k] += 1;
        }
        return m;
    }, [scopedSurveyDateLeads]);

    const l4Reached = useMemo(() => scopedL4Leads.filter(isL4Reached), [scopedL4Leads]);
    const l4Counts = useMemo(() => {
        const m = Object.fromEntries(L4_STATUSES.map((s) => [s.key, 0]));
        for (const l of scopedL4Leads) {
            const k = getL4BucketKey(l.resultStatus);
            if (k && k in m) m[k] += 1;
        }
        return m;
    }, [scopedL4Leads]);

    const closingNumerator = (l4Counts.full_book || 0) + (l4Counts.lunas || 0);
    const prospectNumerator = (l2Counts.hot || 0) + (l2Counts.hot_validated || 0);
    const rateDenominator = scopedCreatedAtLeads.length;
    const closingRate = pct(closingNumerator, rateDenominator);
    const surveyRate = pct(l3Counts.sudah_survey, rateDenominator);
    const prospectRate = pct(prospectNumerator, rateDenominator);

    const statusSalesBreakdown = useMemo(() => {
        if (!isAllSales) {
            return {
                transaction: {},
                visit: {},
                prospek: {},
            };
        }

        return {
            transaction: Object.fromEntries(
                L4_STATUSES.map((status) => [
                    status.key,
                    buildStatusSalesBreakdown(
                        l4FilteredLeads,
                        (lead) => getL4BucketKey(lead.resultStatus) === status.key,
                        salesNameById
                    ),
                ])
            ),
            visit: Object.fromEntries(
                L3_STATUSES.map((status) => [
                    status.key,
                    buildStatusSalesBreakdown(
                        surveyDateFilteredLeads,
                        (lead) => getL3BucketKey(lead.appointmentTag) === status.key,
                        salesNameById
                    ),
                ])
            ),
            prospek: Object.fromEntries(
                L2_STATUSES.map((status) => [
                    status.key,
                    buildStatusSalesBreakdown(
                        createdAtFilteredLeads,
                        (lead) => getL2BucketKey(lead) === status.key,
                        salesNameById
                    ),
                ])
            ),
        };
    }, [createdAtFilteredLeads, surveyDateFilteredLeads, isAllSales, l4FilteredLeads, salesNameById]);

    const chartLeads = useMemo(() => {
        if (!statusFilter) return scopedCreatedAtLeads;
        const { type, key } = statusFilter;
        if (type === 'prospek') {
            return scopedCreatedAtLeads.filter((l) => getL2BucketKey(l) === key);
        }
        if (type === 'visit') {
            return scopedSurveyDateLeads.filter((l) => getL3BucketKey(l.appointmentTag) === key);
        }
        if (type === 'transaction') {
            return scopedL4Leads.filter((l) => getL4BucketKey(l.resultStatus) === key);
        }
        return scopedCreatedAtLeads;
    }, [statusFilter, scopedCreatedAtLeads, scopedSurveyDateLeads, scopedL4Leads]);

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
            {rangeSummary ? (
                <div className="ds-card-head an-head">
                    <div>
                        <span className="ds-card-summary">{rangeSummary}</span>
                    </div>
                </div>
            ) : null}

            <div className="sps-filter-row sps-filter-row--2col">
                <div className="sps-filter-field">
                    <span className="sps-filter-label">Tanggal</span>
                    <Select
                        options={periodOptions}
                        value={activePeriodKey}
                        onChange={handlePeriodChange}
                        placeholder="Periode"
                        clearable={false}
                    />
                    <DateRangePicker
                        value={appliedDateRange || { dateFrom: '', dateTo: '' }}
                        onApply={(range) => onDateRangeChange?.({
                            dateFrom: range?.dateFrom || '',
                            dateTo: range?.dateTo || '',
                        })}
                        onReset={() => onDateRangeChange?.(getPresetRange('thisMonth'))}
                        trigger={({ open }) => {
                            datePickerOpenRef.current = open;
                            return <span style={{ display: 'block', height: 0, visibility: 'hidden' }} />;
                        }}
                    />
                </div>
                {sourceFilterOptions.length > 0 ? (
                    <div className="sps-filter-field">
                        <span className="sps-filter-label">Sumber</span>
                        <Select
                            options={sourceFilterOptions}
                            value={selectedSourceValues}
                            onChange={onSourceChange}
                            placeholder="Semua Sumber"
                            multiple
                            maxDisplayed={2}
                        />
                    </div>
                ) : null}
            </div>

            <div className="ds-tab-body an-body">
                <div className="an-grid">
                    {/* Collapsible Sales Pane (Full Width) */}
                    {viewerRole !== 'sales' ? (
                        <div className="an-sales-pane" ref={salesPaneRef}>
                            {groupOptions.length > 0 ? (
                                <div className="an-sales-group-pills">
                                    <button
                                        type="button"
                                        className={`an-sales-group-pill${selectedGroupId === 'all' ? ' is-active' : ''}`}
                                        onClick={() => setSelectedGroupId('all')}
                                    >
                                        Semua Grup
                                    </button>
                                    {groupOptions.map((g) => (
                                        <button
                                            key={g.id}
                                            type="button"
                                            className={`an-sales-group-pill${selectedGroupId === g.id ? ' is-active' : ''}`}
                                            onClick={() => setSelectedGroupId(g.id)}
                                        >
                                            {g.name}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <button
                                type="button"
                                className={`an-sales-row an-sales-row--total ${selectedSalesId !== 'all' ? 'is-active' : ''}`}
                                onClick={() => {
                                    setIsSalesListOpen(!isSalesListOpen);
                                }}
                            >
                                <span className="an-sales-row-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>
                                        {selectedSalesId === 'all'
                                            ? 'Total Database'
                                            : visibleSales.find((s) => s.id === selectedSalesId)?.name || 'Total Database'}
                                    </span>
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{
                                            transition: 'transform 200ms ease',
                                            transform: isSalesListOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                            color: 'var(--text-muted)'
                                        }}
                                    >
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </span>
                                <strong className="an-sales-row-count">
                                    {formatCount(
                                        selectedSalesId === 'all'
                                            ? totalDatabaseCount
                                            : salesLeadCounts.get(selectedSalesId) || 0
                                    )}
                                </strong>
                            </button>
                            <div className={`an-sales-list${isSalesListOpen ? ' is-open' : ''}`}>
                                <button
                                    type="button"
                                    className={`an-sales-row${selectedSalesId === 'all' ? ' is-active' : ''}`}
                                    onClick={() => {
                                        setSelectedSalesId('all');
                                    }}
                                >
                                    <span className="an-sales-row-label">Total Database</span>
                                    <strong className="an-sales-row-count">{formatCount(totalDatabaseCount)}</strong>
                                </button>
                                {visibleSales.length === 0 ? (
                                    <div className="an-sales-empty">Tidak ada sales</div>
                                ) : (
                                    visibleSales.map((s) => {
                                        const count = salesLeadCounts.get(s.id) || 0;
                                        const active = selectedSalesId === s.id;
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                className={`an-sales-row${active ? ' is-active' : ''}`}
                                                onClick={() => {
                                                    setSelectedSalesId(s.id);
                                                }}
                                                title={s.name}
                                            >
                                                <span className="an-sales-row-label">{s.name}</span>
                                                <strong className="an-sales-row-count">{formatCount(count)}</strong>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : null}

                    {/* Right side: 3 columns */}
                    <div className="an-cols">
                        <ColumnCard
                            title="Transaction"
                            total={l4Reached.length}
                            rateLabel="Closing Rate"
                            rateValue={closingRate}
                            rateFormula="Full Book + Lunas / Total Leads"
                            rateFormulaDetail={formatFormulaDetail([l4Counts.full_book || 0, l4Counts.lunas || 0], rateDenominator)}
                        >
                            {L4_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l4Counts[status.key] || 0}
                                    total={l4Reached.length}
                                    active={isStatusActive('transaction', status.key)}
                                    onClick={() => toggleStatusFilter('transaction', status.key)}
                                    salesBreakdown={statusSalesBreakdown.transaction[status.key]}
                                />
                            ))}
                        </ColumnCard>

                        <ColumnCard
                            title="Prospek Survey"
                            total={l3Reached.length}
                            rateLabel="Survey Rate"
                            rateValue={surveyRate}
                            rateFormula="Sudah Survey / Total Leads"
                            rateFormulaDetail={formatFormulaDetail([l3Counts.sudah_survey || 0], rateDenominator)}
                        >
                            {L3_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l3Counts[status.key] || 0}
                                    total={l3Reached.length}
                                    active={isStatusActive('visit', status.key)}
                                    onClick={() => toggleStatusFilter('visit', status.key)}
                                    salesBreakdown={statusSalesBreakdown.visit[status.key]}
                                />
                            ))}
                        </ColumnCard>

                        <ColumnCard
                            title="Status Prospek"
                            total={l2Reached.length}
                            rateLabel="Prospect Rate"
                            rateValue={prospectRate}
                            rateFormula="Hot / Total Leads"
                            rateFormulaDetail={formatFormulaDetail([prospectNumerator], rateDenominator)}
                        >
                            {L2_STATUSES.map((status) => (
                                <StatusRow
                                    key={status.key}
                                    status={status}
                                    count={l2Counts[status.key] || 0}
                                    total={l2Reached.length}
                                    active={isStatusActive('prospek', status.key)}
                                    onClick={() => toggleStatusFilter('prospek', status.key)}
                                    salesBreakdown={statusSalesBreakdown.prospek[status.key]}
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
