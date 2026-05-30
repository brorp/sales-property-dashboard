import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCount as fmt } from './utils';
import Select from '../../components/Select';
import './DashboardSections.css';

const LINE_COLORS = ['#7C3AED', '#22C55E', '#0EA5E9', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6'];

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

function buildAreaPath(points, chartBottom) {
    if (points.length === 0) return '';
    const last = points[points.length - 1];
    return `${buildSmoothPath(points)} L ${last.x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`;
}

export default function LineChartSection({ data, granularity = 'month', onGranularityChange, dataset = 'l1' }) {
    const svgRef = useRef(null);
    const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState([]);
    const [hoverIndex, setHoverIndex] = useState(null);

    const chartPayload = data?.data?.[granularity]?.[dataset] || { periods: [], series: [] };
    const periods = Array.isArray(chartPayload.periods) ? chartPayload.periods : [];
    const series = Array.isArray(chartPayload.series) ? chartPayload.series : [];

    const visibleSeriesKeys = useMemo(() => series.map((s) => s.key), [series]);
    const activeSeriesKeys = useMemo(
        () => visibleSeriesKeys.filter((k) => !hiddenSeriesKeys.includes(k)),
        [hiddenSeriesKeys, visibleSeriesKeys]
    );

    useEffect(() => {
        setHiddenSeriesKeys((prev) => {
            const next = prev.filter((k) => visibleSeriesKeys.includes(k));
            return next.length === prev.length ? prev : next;
        });
    }, [visibleSeriesKeys]);

    const chartGeometry = useMemo(() => {
        const height = 300;
        const padding = { top: 20, right: 20, bottom: 44, left: 44 };
        const maxValue = Math.max(
            1,
            ...periods.flatMap((p) =>
                activeSeriesKeys.length > 0
                    ? activeSeriesKeys.map((k) => Number(p.values?.[k] || 0))
                    : Object.values(p.values || {}).map((v) => Number(v || 0))
            )
        );
        const minXStep = granularity === 'day' ? 60 : 32;
        const baseChartWidth = 800 - padding.left - padding.right;
        const requiredChartWidth = periods.length > 1 ? (periods.length - 1) * minXStep : baseChartWidth;
        const chartWidth = Math.max(baseChartWidth, requiredChartWidth);
        const width = chartWidth + padding.left + padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const xStep = periods.length > 1 ? chartWidth / (periods.length - 1) : chartWidth / 2;
        return {
            width, height, padding, maxValue, chartHeight, chartWidth, xStep,
            chartBottom: height - padding.bottom,
            xLabelEvery: periods.length > 60 ? 7 : periods.length > 31 ? 4 : periods.length > 20 ? 2 : 1,
        };
    }, [activeSeriesKeys, granularity, periods]);

    const seriesWithColor = useMemo(
        () => series.map((s, i) => ({ ...s, color: LINE_COLORS[i % LINE_COLORS.length] })),
        [series]
    );

    const activeSeries = useMemo(
        () => seriesWithColor.filter((s) => !hiddenSeriesKeys.includes(s.key)),
        [hiddenSeriesKeys, seriesWithColor]
    );

    const seriesWithPoints = useMemo(() => activeSeries.map((s) => {
        const points = periods.map((period, i) => {
            const val = Number(period.values?.[s.key] || 0);
            const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * i : chartGeometry.chartWidth / 2);
            const y = chartGeometry.padding.top + chartGeometry.chartHeight - (val / chartGeometry.maxValue) * chartGeometry.chartHeight;
            return { x, y, value: val, label: period.label };
        });
        return { ...s, points, path: buildSmoothPath(points), areaPath: buildAreaPath(points, chartGeometry.chartBottom) };
    }), [activeSeries, chartGeometry, periods]);

    const gridTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
        value: Math.round((chartGeometry.maxValue / 4) * (4 - i)),
        y: chartGeometry.padding.top + (chartGeometry.chartHeight / 4) * i,
    })), [chartGeometry]);

    const handleMouseMove = useCallback((e) => {
        if (!svgRef.current || periods.length === 0) return;
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = ((e.clientX - rect.left) / rect.width) * chartGeometry.width;
        const rawIdx = periods.length <= 1 ? 0 : Math.round((svgX - chartGeometry.padding.left) / chartGeometry.xStep);
        setHoverIndex(Math.max(0, Math.min(periods.length - 1, rawIdx)));
    }, [chartGeometry, periods.length]);

    const hoverX = hoverIndex !== null && periods.length > 0
        ? chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * hoverIndex : chartGeometry.chartWidth / 2)
        : null;

    const granularityOptions = useMemo(
        () => (data?.granularityOptions || []).map((o) => ({ value: o.key, label: o.label })),
        [data]
    );

    if (!data) return null;

    const hasData = seriesWithColor.length > 0 && periods.length > 0;

    return (
        <div className="lc-card">
            <div className="lc-header">
                <div>
                    <span className="lc-eyebrow">Tren Data</span>
                    <h2 className="lc-title">Line Chart</h2>
                </div>
                {granularityOptions.length > 0 && (
                    <div className="lc-controls" style={{ minWidth: '150px' }}>
                        <Select
                            options={granularityOptions}
                            value={granularity}
                            onChange={(v) => onGranularityChange?.(v || 'month')}
                            clearable={false}
                        />
                    </div>
                )}
            </div>

            {seriesWithColor.length > 0 && (
                <div className="lc-legend">
                    {seriesWithColor.map((item) => {
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
            ) : seriesWithPoints.length === 0 ? (
                <div className="lc-empty">Semua garis disembunyikan. Klik legend untuk menampilkan.</div>
            ) : (
                <div className="lc-chart-wrap">
                    {/* Sticky Y-Axis Overlay */}
                    <div
                        className="lc-y-axis-sticky"
                        style={{
                            width: `${chartGeometry.padding.left}px`,
                            height: `${chartGeometry.height}px`,
                        }}
                    >
                        <svg
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                overflow: 'visible',
                            }}
                        >
                            {gridTicks.map((tick) => (
                                <text
                                    key={`y-label-${tick.value}-${tick.y}`}
                                    x={chartGeometry.padding.left - 8}
                                    y={tick.y + 4}
                                    textAnchor="end"
                                    fontSize="10"
                                    fill="#94A3B8"
                                >
                                    {tick.value}
                                </text>
                            ))}
                        </svg>
                    </div>

                    {/* Horizontally scrollable chart content */}
                    <div className="lc-chart-scroll">
                        <svg
                            ref={svgRef}
                            className="lc-svg"
                            style={{
                                width: `${chartGeometry.width}px`,
                                minWidth: `${chartGeometry.width}px`,
                                height: `${chartGeometry.height}px`,
                            }}
                            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setHoverIndex(null)}
                        >
                            <defs>
                                {seriesWithPoints.map((s) => (
                                    <linearGradient key={s.key} id={`lc-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={s.color} stopOpacity="0.15" />
                                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                                    </linearGradient>
                                ))}
                            </defs>

                            {/* Grid lines (horizontal only, without text) */}
                            {gridTicks.map((tick) => (
                                <line
                                    key={`grid-line-${tick.y}`}
                                    x1={chartGeometry.padding.left}
                                    x2={chartGeometry.width - chartGeometry.padding.right}
                                    y1={tick.y}
                                    y2={tick.y}
                                    stroke="rgba(30,58,95,0.07)"
                                    strokeDasharray="4 4"
                                />
                            ))}

                            {/* Hover crosshair */}
                            {hoverX !== null && (
                                <line
                                    x1={hoverX} x2={hoverX}
                                    y1={chartGeometry.padding.top} y2={chartGeometry.chartBottom}
                                    stroke="rgba(30,58,95,0.18)" strokeWidth="1" strokeDasharray="4 3"
                                />
                            )}

                            {/* Area fills */}
                            {seriesWithPoints.map((s) => (
                                <path key={`area-${s.key}`} d={s.areaPath} fill={`url(#lc-grad-${s.key})`} />
                            ))}

                            {/* Lines */}
                            {seriesWithPoints.map((s) => (
                                <path
                                    key={`line-${s.key}`} d={s.path}
                                    fill="none" stroke={s.color} strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                />
                            ))}

                            {/* Dots */}
                            {seriesWithPoints.map((s) =>
                                s.points.map((pt, i) => {
                                    const isHover = i === hoverIndex;
                                    const isEndpoint = periods.length <= 8 || i === 0 || i === s.points.length - 1;
                                    if (!isHover && !isEndpoint) return null;
                                    return (
                                        <circle
                                            key={`dot-${s.key}-${i}`}
                                            cx={pt.x} cy={pt.y}
                                            r={isHover ? 5 : 3}
                                            fill={s.color} stroke="#FFFFFF" strokeWidth={isHover ? 2 : 1.5}
                                        />
                                    );
                                })
                            )}

                            {/* X-axis labels */}
                            {periods.map((period, i) => {
                                const show = i === 0 || i === periods.length - 1 || i % chartGeometry.xLabelEvery === 0;
                                if (!show) return null;
                                const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * i : chartGeometry.chartWidth / 2);
                                return (
                                    <text
                                        key={period.key} x={x}
                                        y={chartGeometry.height - 8}
                                        textAnchor="middle"
                                        fontSize="10" fill="#94A3B8"
                                    >
                                        {period.label}
                                    </text>
                                );
                            })}

                            {/* Hover tooltip */}
                            {hoverIndex !== null && hoverX !== null && periods[hoverIndex] && (() => {
                                const tooltipItems = seriesWithPoints.map((s) => ({
                                    color: s.color, label: s.label,
                                    value: fmt(s.points[hoverIndex]?.value || 0),
                                }));
                                const bw = 148;
                                const lineH = 18;
                                const bh = 26 + tooltipItems.length * lineH;
                                const bx = hoverX + 12 + bw > chartGeometry.width - chartGeometry.padding.right
                                    ? hoverX - bw - 12 : hoverX + 12;
                                const by = chartGeometry.padding.top + 4;
                                return (
                                    <g style={{ filter: 'drop-shadow(0 2px 8px rgba(30,58,95,0.12))' }}>
                                        <rect x={bx} y={by} width={bw} height={bh} rx="7" fill="white" stroke="rgba(30,58,95,0.1)" strokeWidth="1" />
                                        <text x={bx + 10} y={by + 16} fontSize="10" fontWeight="700" fill="#1E3A5F">
                                            {periods[hoverIndex].label}
                                        </text>
                                        {tooltipItems.map((item, ti) => (
                                            <g key={item.label}>
                                                <circle cx={bx + 16} cy={by + 26 + ti * lineH} r="4" fill={item.color} />
                                                <text x={bx + 27} y={by + 30 + ti * lineH} fontSize="10" fill="#64748B">{item.label}</text>
                                                <text x={bx + bw - 8} y={by + 30 + ti * lineH} fontSize="10" fontWeight="700" fill="#1E3A5F" textAnchor="end">{item.value}</text>
                                            </g>
                                        ))}
                                    </g>
                                );
                            })()}
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
}
