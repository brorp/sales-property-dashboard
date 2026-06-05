import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCount as fmt } from './utils';
import Select from '../../components/Select';
import DateRangePicker from '../../components/DateRangePicker';
import { DATE_PRESET_OPTIONS, getPresetRange } from '../../utils/datePresets';
import './DashboardSections.css';

const SERIES_COLORS = [
    '#7C3AED', // purple (only one purple)
    '#22C55E', // green
    '#F97316', // orange
    '#0EA5E9', // sky blue
    '#EF4444', // red
    '#14B8A6', // teal
    '#EC4899', // pink
    '#EAB308', // yellow
    '#3B82F6', // blue
    '#84CC16', // lime
    '#06B6D4', // cyan
    '#BE185D', // rose
    '#D97706', // amber
    '#16A34A', // emerald (slightly darker green)
];

const Y_AXIS_OPTIONS = [
    { key: 'source', label: 'Sumber Leads' },
    { key: 'l3', label: 'Status L3' },
    { key: 'l4', label: 'Status L4' },
];

const GRANULARITY_OPTIONS = [
    { key: 'day', label: 'Hari' },
    { key: 'week', label: 'Minggu' },
    { key: 'month', label: 'Bulan' },
    { key: 'year', label: 'Tahun' },
];

const L3_META = [
    { key: 'sudah_survey', label: 'Sudah Survey' },
    { key: 'mau_survey', label: 'Mau Survey' },
    { key: 'dibatalkan', label: 'Batal Survey' },
];

const L4_META = [
    { key: 'lunas', label: 'Lunas' },
    { key: 'full_book', label: 'Full Book' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'cancel_full_book', label: 'Cancel Full Book' },
    { key: 'cancel_reserve', label: 'Cancel Reserve' },
];

const TOP_SOURCE_LIMIT = 6;

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

function getL3BucketKey(appointmentTag) {
    const t = toLowerTrimmed(appointmentTag);
    if (t === 'sudah_survey' || t === 'mau_survey' || t === 'dibatalkan') return t;
    return null;
}

function getCategoryForY(yKey, lead) {
    if (yKey === 'source') return lead.source || 'Lainnya';
    if (yKey === 'l3') return getL3BucketKey(lead.appointmentTag);
    if (yKey === 'l4') return getResultStatusKey(lead.resultStatus);
    return null;
}

function getDateForY(yKey, lead) {
    if (yKey === 'l4') {
        const d = lead.resultStatusUpdatedAt;
        return d ? new Date(d) : null;
    }
    const d = lead.createdAt || lead.receivedAt;
    return d ? new Date(d) : null;
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

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfWeek(date) {
    const d = startOfDay(date);
    const offset = (d.getDay() + 6) % 7; // Monday-based
    d.setDate(d.getDate() - offset);
    return d;
}

function toPeriodStart(date, granularity) {
    const d = new Date(date);
    if (granularity === 'year') return new Date(d.getFullYear(), 0, 1);
    if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (granularity === 'week') return startOfWeek(d);
    return startOfDay(d);
}

function addPeriod(date, granularity) {
    const d = new Date(date);
    if (granularity === 'year') return new Date(d.getFullYear() + 1, 0, 1);
    if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    if (granularity === 'week') {
        const next = new Date(d); next.setDate(next.getDate() + 7); return next;
    }
    const next = new Date(d); next.setDate(next.getDate() + 1); return next;
}

function formatPeriodLabel(date, granularity) {
    if (granularity === 'year') {
        return new Intl.DateTimeFormat('id-ID', { year: 'numeric' }).format(date);
    }
    if (granularity === 'month') {
        return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(date);
    }
    if (granularity === 'week') {
        const end = new Date(date); end.setDate(end.getDate() + 6);
        const fmtShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
        return `${fmtShort.format(date)} – ${fmtShort.format(end)}`;
    }
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
}

function buildPeriods(rangeStart, rangeEnd, granularity) {
    if (!rangeStart || !rangeEnd) return [];
    const start = toPeriodStart(rangeStart, granularity);
    const max = toPeriodStart(rangeEnd, granularity);
    const periods = [];
    let cursor = new Date(start);
    let safety = 0;
    while (cursor.getTime() <= max.getTime() && safety < 4000) {
        const next = addPeriod(cursor, granularity);
        periods.push({
            key: cursor.toISOString(),
            label: formatPeriodLabel(cursor, granularity),
            start: new Date(cursor),
            end: next,
        });
        cursor = next;
        safety += 1;
    }
    return periods;
}

function buildSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const cpx = (points[i + 1].x - points[i].x) / 3;
        d += ` C ${points[i].x + cpx} ${points[i].y} ${points[i + 1].x - cpx} ${points[i + 1].y} ${points[i + 1].x} ${points[i + 1].y}`;
    }
    return d;
}

function FilterIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

export default function LineChartSection({
    leads = [],
    transactionRecap = null,
    viewerRole = '',
    viewerId = '',
}) {
    const [granularity, setGranularity] = useState('month');
    const [selectedSalesId, setSelectedSalesId] = useState('all');
    const [yAxes, setYAxes] = useState(['source']);
    const [dateRange, setDateRange] = useState(() => getPresetRange('thisMonth'));
    const [showFilter, setShowFilter] = useState(false);
    const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState([]);
    const [hoverIndex, setHoverIndex] = useState(null);
    const customPickerOpenRef = useRef(null);
    const svgRef = useRef(null);

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
            return me ? [me] : [];
        }
        out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        return out;
    }, [transactionRecap, viewerRole, viewerId]);

    const rangeStart = useMemo(() => parseInputDate(dateRange?.dateFrom), [dateRange?.dateFrom]);
    const rangeEnd = useMemo(() => parseInputDateEnd(dateRange?.dateTo), [dateRange?.dateTo]);

    const salesFilteredLeads = useMemo(() => {
        if (selectedSalesId === 'all') return leads;
        return leads.filter((l) => l.assignedTo === selectedSalesId);
    }, [leads, selectedSalesId]);

    const periods = useMemo(
        () => buildPeriods(rangeStart, rangeEnd, granularity),
        [rangeStart, rangeEnd, granularity]
    );

    const series = useMemo(() => {
        if (periods.length === 0 || yAxes.length === 0) return [];
        const out = [];

        const isInPeriod = (date, period) => {
            if (!date) return false;
            const t = date.getTime();
            return t >= period.start.getTime() && t < period.end.getTime();
        };

        const isInRange = (date) => {
            if (!date) return false;
            if (rangeStart && date.getTime() < rangeStart.getTime()) return false;
            if (rangeEnd && date.getTime() > rangeEnd.getTime()) return false;
            return true;
        };

        for (const yKey of yAxes) {
            // Determine categories
            let categories = [];
            if (yKey === 'source') {
                const counts = new Map();
                for (const lead of salesFilteredLeads) {
                    const d = getDateForY('source', lead);
                    if (!isInRange(d)) continue;
                    const cat = getCategoryForY('source', lead);
                    if (!cat) continue;
                    counts.set(cat, (counts.get(cat) || 0) + 1);
                }
                categories = Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, TOP_SOURCE_LIMIT)
                    .map(([k]) => ({ key: k, label: k }));
            } else if (yKey === 'l3') {
                categories = L3_META.map((m) => ({ key: m.key, label: m.label }));
            } else if (yKey === 'l4') {
                categories = L4_META.map((m) => ({ key: m.key, label: m.label }));
            }

            for (const cat of categories) {
                const counts = periods.map((p) => 0);
                for (const lead of salesFilteredLeads) {
                    const d = getDateForY(yKey, lead);
                    const leadCat = getCategoryForY(yKey, lead);
                    if (!leadCat || leadCat !== cat.key) continue;
                    if (!isInRange(d)) continue;
                    const pi = periods.findIndex((p) => isInPeriod(d, p));
                    if (pi >= 0) counts[pi] += 1;
                }
                const total = counts.reduce((s, n) => s + n, 0);
                if (total === 0) continue;
                const yMeta = Y_AXIS_OPTIONS.find((o) => o.key === yKey);
                out.push({
                    key: `${yKey}:${cat.key}`,
                    yKey,
                    label: yAxes.length > 1 ? `${yMeta?.label || yKey} · ${cat.label}` : cat.label,
                    counts,
                    total,
                });
            }
        }

        // Assign colors
        return out.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
    }, [periods, yAxes, salesFilteredLeads, rangeStart, rangeEnd]);

    const visibleSeries = useMemo(
        () => series.filter((s) => !hiddenSeriesKeys.includes(s.key)),
        [series, hiddenSeriesKeys]
    );

    useEffect(() => {
        setHiddenSeriesKeys((prev) => prev.filter((k) => series.some((s) => s.key === k)));
        setHoverIndex(null);
    }, [series]);

    const mode = yAxes.length >= 2 ? 'bar' : 'line';

    // Chart geometry (responsive viewBox)
    const VB_WIDTH = 1000;
    const VB_HEIGHT = 320;
    const PAD = { top: 20, right: 24, bottom: 50, left: 56 };
    const CHART_W = VB_WIDTH - PAD.left - PAD.right;
    const CHART_H = VB_HEIGHT - PAD.top - PAD.bottom;
    const CHART_BOTTOM = PAD.top + CHART_H;

    const periodCount = periods.length;
    const xStep = periodCount > 1 ? CHART_W / (periodCount - 1) : 0;
    const barXStep = periodCount > 0 ? CHART_W / periodCount : CHART_W;

    const maxValue = useMemo(() => {
        if (visibleSeries.length === 0 || periodCount === 0) return 1;
        if (mode === 'bar') {
            // stacked: max of per-period sums
            const sums = periods.map((_, i) => visibleSeries.reduce((s, ser) => s + (ser.counts[i] || 0), 0));
            return Math.max(1, ...sums);
        }
        return Math.max(1, ...visibleSeries.flatMap((s) => s.counts));
    }, [visibleSeries, periods, periodCount, mode]);

    const yScale = (v) => CHART_BOTTOM - (v / maxValue) * CHART_H;

    const xForLine = (i) => PAD.left + (periodCount > 1 ? xStep * i : CHART_W / 2);
    const xForBarCenter = (i) => PAD.left + barXStep * (i + 0.5);

    const lineSeries = useMemo(() => {
        if (mode !== 'line') return [];
        return visibleSeries.map((s) => {
            const points = s.counts.map((v, i) => ({ x: xForLine(i), y: yScale(v), value: v }));
            return { ...s, points, path: buildSmoothPath(points) };
        });
    }, [visibleSeries, mode, periodCount, maxValue, xStep]);

    const barStacks = useMemo(() => {
        if (mode !== 'bar') return [];
        const stackBarW = Math.max(8, Math.min(48, barXStep * 0.62));
        return periods.map((p, i) => {
            let cursor = CHART_BOTTOM;
            const segments = visibleSeries.map((ser) => {
                const v = ser.counts[i] || 0;
                const h = (v / maxValue) * CHART_H;
                const y = cursor - h;
                const seg = { key: ser.key, color: ser.color, value: v, x: xForBarCenter(i) - stackBarW / 2, y, w: stackBarW, h };
                cursor -= h;
                return seg;
            });
            const sum = segments.reduce((s, ss) => s + ss.value, 0);
            return { period: p, index: i, segments, sum };
        });
    }, [visibleSeries, periods, mode, maxValue, barXStep]);

    const gridTicks = useMemo(() => {
        const ticks = [];
        for (let i = 0; i <= 4; i++) {
            const value = Math.round((maxValue / 4) * (4 - i));
            ticks.push({ value, y: PAD.top + (CHART_H / 4) * i });
        }
        return ticks;
    }, [maxValue]);

    const xLabelEvery = periodCount > 60 ? 7 : periodCount > 31 ? 4 : periodCount > 14 ? 2 : 1;

    // Hover handling
    const handleMouseMove = (e) => {
        if (!svgRef.current || periodCount === 0) return;
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = ((e.clientX - rect.left) / rect.width) * VB_WIDTH;
        let raw;
        if (mode === 'bar') {
            raw = Math.floor((svgX - PAD.left) / barXStep);
        } else {
            raw = Math.round((svgX - PAD.left) / (xStep || 1));
        }
        setHoverIndex(Math.max(0, Math.min(periodCount - 1, raw)));
    };

    const handleMouseLeave = () => setHoverIndex(null);

    const hoverX = hoverIndex !== null
        ? (mode === 'bar' ? xForBarCenter(hoverIndex) : xForLine(hoverIndex))
        : null;

    // ── Filter helpers
    const isCustomActive = !DATE_PRESET_OPTIONS.some((o) => {
        const pr = getPresetRange(o.value);
        return pr.dateFrom === dateRange.dateFrom && pr.dateTo === dateRange.dateTo;
    });
    const activePeriodKey = isCustomActive ? 'custom' : DATE_PRESET_OPTIONS.find((o) => {
        const pr = getPresetRange(o.value);
        return pr.dateFrom === dateRange.dateFrom && pr.dateTo === dateRange.dateTo;
    })?.value;

    const periodLabel = isCustomActive
        ? `${dateRange.dateFrom} – ${dateRange.dateTo}`
        : DATE_PRESET_OPTIONS.find((o) => o.value === activePeriodKey)?.label;

    const periodOptionsWithCustom = useMemo(() => [
        ...DATE_PRESET_OPTIONS.map(({ value, label }) => ({ value, label })),
        { value: 'custom', label: isCustomActive ? `Kustom: ${dateRange.dateFrom} – ${dateRange.dateTo}` : 'Rentang Kustom' },
    ], [isCustomActive, dateRange]);

    const handlePeriodChange = (v) => {
        if (!v) return;
        if (v === 'custom') { customPickerOpenRef.current?.(); return; }
        setDateRange(getPresetRange(v));
    };

    const toggleY = (key) => {
        setYAxes((prev) => {
            if (prev.includes(key)) {
                if (prev.length === 1) return prev; // keep at least one
                return prev.filter((k) => k !== key);
            }
            return [...prev, key];
        });
    };

    const selectedSalesLabel = selectedSalesId === 'all'
        ? 'Semua Sales'
        : (visibleSales.find((s) => s.id === selectedSalesId)?.name || 'Sales');

    const yAxesLabel = yAxes.length === 0
        ? '—'
        : yAxes.map((k) => Y_AXIS_OPTIONS.find((o) => o.key === k)?.label || k).join(' + ');

    const hasData = visibleSeries.length > 0 && periodCount > 0;

    return (
        <div className="ds-card lc-section">
            <div className="ds-card-head lc-head">
                <div>
                    <div className="an-head-title-row">
                        <h2 className="ds-card-title">Line Chart</h2>
                        <span className="tpc-period-badge">{periodLabel}</span>
                    </div>
                    <span className="ds-card-summary">
                        {selectedSalesLabel} · {yAxesLabel} · {GRANULARITY_OPTIONS.find((g) => g.key === granularity)?.label}
                    </span>
                </div>
                <button type="button" className="ds-section-filter-btn" onClick={() => setShowFilter(true)} aria-label="Filter">
                    <FilterIcon />
                </button>
            </div>

            <div className="ds-tab-body lc-body">
                <div className="lc-controls-row">
                    <div className="lc-gran-pills">
                        {GRANULARITY_OPTIONS.map((opt) => (
                            <button
                                key={opt.key}
                                type="button"
                                className={`lc-gran-pill${granularity === opt.key ? ' active' : ''}`}
                                onClick={() => setGranularity(opt.key)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="lc-y-chips">
                        <span className="lc-y-chips-label">Y Axis</span>
                        {Y_AXIS_OPTIONS.map((opt) => {
                            const active = yAxes.includes(opt.key);
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`lc-y-chip${active ? ' active' : ''}`}
                                    onClick={() => toggleY(opt.key)}
                                    title={active ? `Hilangkan ${opt.label}` : `Tambah ${opt.label}`}
                                >
                                    <span className="lc-y-chip-check">{active ? '✓' : '+'}</span>
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {series.length > 0 && (
                    <div className="lc-legend">
                        {series.map((item) => {
                            const isHidden = hiddenSeriesKeys.includes(item.key);
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={`lc-legend-item${isHidden ? ' is-hidden' : ''}`}
                                    onClick={() => setHiddenSeriesKeys((prev) =>
                                        prev.includes(item.key) ? prev.filter((k) => k !== item.key) : [...prev, item.key]
                                    )}
                                    title={`${isHidden ? 'Tampilkan' : 'Sembunyikan'} ${item.label}`}
                                >
                                    <span className="lc-legend-dot" style={{ background: item.color }} />
                                    <span className="lc-legend-name">{item.label}</span>
                                    <strong className="lc-legend-total">{fmt(item.total)}</strong>
                                </button>
                            );
                        })}
                    </div>
                )}

                {!hasData ? (
                    <div className="lc-empty">Belum ada data untuk kombinasi filter ini.</div>
                ) : (
                    <div className="lc-chart-wrap-v2">
                        <svg
                            ref={svgRef}
                            className="lc-svg-v2"
                            viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
                            preserveAspectRatio="none"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        >
                            <defs>
                                {mode === 'line' ? lineSeries.map((s) => (
                                    <linearGradient key={s.key} id={`lc-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                                    </linearGradient>
                                )) : null}
                            </defs>

                            {/* Grid lines */}
                            {gridTicks.map((tick) => (
                                <g key={`grid-${tick.y}`}>
                                    <line
                                        x1={PAD.left} x2={VB_WIDTH - PAD.right}
                                        y1={tick.y} y2={tick.y}
                                        stroke="rgba(148, 163, 184, 0.20)"
                                        strokeDasharray="4 4"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                    <text
                                        x={PAD.left - 8}
                                        y={tick.y + 4}
                                        textAnchor="end"
                                        fontSize="10"
                                        fill="#94A3B8"
                                    >{tick.value}</text>
                                </g>
                            ))}

                            {/* Hover crosshair */}
                            {hoverX !== null && (
                                <line
                                    x1={hoverX} x2={hoverX}
                                    y1={PAD.top} y2={CHART_BOTTOM}
                                    stroke="rgba(148, 163, 184, 0.45)"
                                    strokeWidth="1"
                                    strokeDasharray="4 3"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}

                            {/* Bars or Lines */}
                            {mode === 'bar' ? (
                                barStacks.map((stack) => (
                                    <g key={stack.period.key}>
                                        {stack.segments.map((seg) => (
                                            seg.h > 0 ? (
                                                <rect
                                                    key={seg.key}
                                                    x={seg.x} y={seg.y}
                                                    width={seg.w} height={Math.max(0.5, seg.h)}
                                                    fill={seg.color}
                                                    opacity={hoverIndex === null || hoverIndex === stack.index ? 1 : 0.4}
                                                    rx={1}
                                                />
                                            ) : null
                                        ))}
                                    </g>
                                ))
                            ) : (
                                <>
                                    {lineSeries.map((s) => (
                                        <path
                                            key={`area-${s.key}`}
                                            d={`${s.path} L ${s.points[s.points.length - 1].x} ${CHART_BOTTOM} L ${s.points[0].x} ${CHART_BOTTOM} Z`}
                                            fill={`url(#lc-grad-${s.key})`}
                                        />
                                    ))}
                                    {lineSeries.map((s) => (
                                        <path
                                            key={`line-${s.key}`}
                                            d={s.path}
                                            fill="none"
                                            stroke={s.color}
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    ))}
                                    {lineSeries.map((s) => (
                                        s.points.map((pt, i) => {
                                            const isHover = i === hoverIndex;
                                            const isEnd = i === 0 || i === s.points.length - 1;
                                            if (!isHover && !isEnd && periodCount > 8) return null;
                                            return (
                                                <circle
                                                    key={`dot-${s.key}-${i}`}
                                                    cx={pt.x} cy={pt.y}
                                                    r={isHover ? 5 : 3}
                                                    fill={s.color}
                                                    stroke="#FFFFFF"
                                                    strokeWidth={isHover ? 2 : 1.5}
                                                    vectorEffect="non-scaling-stroke"
                                                />
                                            );
                                        })
                                    ))}
                                </>
                            )}

                            {/* X-axis labels */}
                            {periods.map((p, i) => {
                                const show = i === 0 || i === periods.length - 1 || i % xLabelEvery === 0;
                                if (!show) return null;
                                const x = mode === 'bar' ? xForBarCenter(i) : xForLine(i);
                                return (
                                    <text
                                        key={p.key}
                                        x={x}
                                        y={VB_HEIGHT - 14}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fill="#94A3B8"
                                    >{p.label}</text>
                                );
                            })}

                            {/* Tooltip */}
                            {hoverIndex !== null && periods[hoverIndex] && hoverX !== null && (() => {
                                const items = visibleSeries.map((s) => ({
                                    color: s.color,
                                    label: s.label,
                                    value: s.counts[hoverIndex] || 0,
                                }));
                                const bw = 200;
                                const lineH = 16;
                                const bh = 28 + items.length * lineH;
                                const bx = hoverX + 14 + bw > VB_WIDTH - PAD.right
                                    ? hoverX - bw - 14
                                    : hoverX + 14;
                                const by = PAD.top + 4;
                                return (
                                    <g>
                                        <rect
                                            x={bx} y={by}
                                            width={bw} height={bh}
                                            rx="6"
                                            fill="rgba(15, 23, 42, 0.95)"
                                            stroke="rgba(148, 163, 184, 0.4)"
                                            strokeWidth="1"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                        <text x={bx + 10} y={by + 18} fontSize="11" fontWeight="700" fill="#F1F5F9">
                                            {periods[hoverIndex].label}
                                        </text>
                                        {items.map((item, ti) => (
                                            <g key={`${item.label}-${ti}`}>
                                                <circle cx={bx + 16} cy={by + 30 + ti * lineH} r="3.5" fill={item.color} />
                                                <text x={bx + 26} y={by + 33 + ti * lineH} fontSize="10" fill="#CBD5E1">{item.label}</text>
                                                <text x={bx + bw - 10} y={by + 33 + ti * lineH} fontSize="10" fontWeight="700" fill="#F1F5F9" textAnchor="end">{item.value}</text>
                                            </g>
                                        ))}
                                    </g>
                                );
                            })()}
                        </svg>
                    </div>
                )}
            </div>

            {/* Filter drawer */}
            {showFilter ? (
                <div className="dash-drawer-overlay" onClick={() => setShowFilter(false)}>
                    <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="dash-drawer-header">
                            <span className="dash-drawer-title">Filter Line Chart</span>
                            <button type="button" className="dash-drawer-close" onClick={() => setShowFilter(false)}>
                                <CloseIcon />
                            </button>
                        </div>
                        <div className="dash-drawer-body">
                            <div className="dash-drawer-section">
                                <span className="dash-drawer-section-label">Periode</span>
                                <Select
                                    options={periodOptionsWithCustom}
                                    value={activePeriodKey}
                                    onChange={handlePeriodChange}
                                    placeholder="Pilih Periode"
                                />
                                <DateRangePicker
                                    value={dateRange}
                                    onApply={(r) => setDateRange({ dateFrom: r.dateFrom || '', dateTo: r.dateTo || '' })}
                                    onReset={() => setDateRange(getPresetRange('thisMonth'))}
                                    trigger={({ open }) => {
                                        customPickerOpenRef.current = open;
                                        return <span style={{ display: 'block', height: 0, visibility: 'hidden' }} />;
                                    }}
                                />
                            </div>

                            {viewerRole !== 'sales' ? (
                                <div className="dash-drawer-section">
                                    <span className="dash-drawer-section-label">Sales</span>
                                    <Select
                                        options={[{ value: 'all', label: 'Semua Sales' }, ...visibleSales.map((s) => ({ value: s.id, label: s.name }))]}
                                        value={selectedSalesId}
                                        onChange={(v) => setSelectedSalesId(v || 'all')}
                                        placeholder="Semua Sales"
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
