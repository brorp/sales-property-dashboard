import { useEffect, useMemo, useState } from 'react';
import Accordion from '../../components/Accordion';
import './DashboardSections.css';

const LINE_COLORS = ['#8B5CF6', '#34D399', '#60A5FA', '#F59E0B', '#FB7185', '#A78BFA', '#2DD4BF'];

function buildPath(points) {
    if (!points.length) {
        return '';
    }

    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

export default function LineChartSection({ data, dateFilterControl = null }) {
    const [granularity, setGranularity] = useState(data?.defaultGranularity || 'month');
    const [dataset, setDataset] = useState(data?.defaultDataset || 'l4');
    const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState([]);

    useEffect(() => {
        if (!data) {
            return;
        }

        setGranularity((prev) => (
            data.granularityOptions?.some((item) => item.key === prev)
                ? prev
                : data.defaultGranularity || 'month'
        ));
        setDataset((prev) => (
            data.datasetOptions?.some((item) => item.key === prev)
                ? prev
                : data.defaultDataset || 'l4'
        ));
    }, [data]);

    const chartPayload = data?.data?.[granularity]?.[dataset] || { periods: [], series: [] };
    const periods = Array.isArray(chartPayload.periods) ? chartPayload.periods : [];
    const series = Array.isArray(chartPayload.series) ? chartPayload.series : [];
    const datasetLabel = data?.datasetOptions?.find((item) => item.key === dataset)?.label || 'Data';
    const granularityLabel = data?.granularityOptions?.find((item) => item.key === granularity)?.label || 'Bulan';
    const visibleSeries = useMemo(() => dataset === 'source'
        ? series.filter((item) => Number(item.total || 0) > 0)
        : series, [dataset, series]);
    const visibleSeriesKeys = useMemo(() => visibleSeries.map((item) => item.key), [visibleSeries]);
    const activeSeriesKeys = useMemo(
        () => visibleSeriesKeys.filter((key) => !hiddenSeriesKeys.includes(key)),
        [hiddenSeriesKeys, visibleSeriesKeys]
    );

    useEffect(() => {
        setHiddenSeriesKeys((prev) => {
            const next = prev.filter((key) => visibleSeriesKeys.includes(key));
            return next.length === prev.length ? prev : next;
        });
    }, [visibleSeriesKeys]);

    const chartGeometry = useMemo(() => {
        const width = 720;
        const height = 280;
        const denseXAxis = granularity === 'day' && periods.length >= 20;
        const padding = { top: 16, right: 16, bottom: denseXAxis ? 62 : 38, left: 36 };
        const maxValue = Math.max(
            1,
            ...periods.flatMap((period) => (
                activeSeriesKeys.length > 0
                    ? activeSeriesKeys.map((key) => Number(period.values?.[key] || 0))
                    : Object.values(period.values || {}).map((value) => Number(value || 0))
            ))
        );
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const xStep = periods.length > 1 ? chartWidth / (periods.length - 1) : chartWidth / 2;

        return {
            width,
            height,
            padding,
            maxValue,
            chartHeight,
            chartWidth,
            xStep,
            denseXAxis,
            xLabelEvery: periods.length > 60 ? 7 : periods.length > 31 ? 4 : periods.length > 20 ? 2 : 1,
        };
    }, [activeSeriesKeys, granularity, periods]);

    const seriesWithColor = useMemo(() => {
        return visibleSeries.map((seriesItem, index) => {
            return {
                ...seriesItem,
                color: LINE_COLORS[index % LINE_COLORS.length],
            };
        });
    }, [visibleSeries]);

    const activeSeries = useMemo(
        () => seriesWithColor.filter((seriesItem) => !hiddenSeriesKeys.includes(seriesItem.key)),
        [hiddenSeriesKeys, seriesWithColor]
    );

    const seriesWithPoints = useMemo(() => {
        return activeSeries.map((seriesItem) => {
            const points = periods.map((period, periodIndex) => {
                const rawValue = Number(period.values?.[seriesItem.key] || 0);
                const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * periodIndex : chartGeometry.chartWidth / 2);
                const y = chartGeometry.padding.top + chartGeometry.chartHeight - ((rawValue / chartGeometry.maxValue) * chartGeometry.chartHeight);
                return { x, y, value: rawValue, label: period.label };
            });

            return {
                ...seriesItem,
                points,
                path: buildPath(points),
            };
        });
    }, [activeSeries, chartGeometry.chartHeight, chartGeometry.chartWidth, chartGeometry.maxValue, chartGeometry.padding.left, chartGeometry.padding.top, chartGeometry.xStep, periods]);

    const gridTicks = useMemo(() => {
        return Array.from({ length: 4 }, (_, index) => {
            const value = Math.round((chartGeometry.maxValue / 3) * (3 - index));
            const y = chartGeometry.padding.top + (chartGeometry.chartHeight / 3) * index;
            return { value, y };
        });
    }, [chartGeometry.chartHeight, chartGeometry.maxValue, chartGeometry.padding.top]);

    return (
        <Accordion
            title="Line Chart"
            summary={`Tren Data`}
            defaultExpanded={false}
        >
            <div className="line-chart-shell">
                {dateFilterControl}

                <div className="line-chart-controls">
                    <div className="input-group">
                        <label>Time</label>
                        <select
                            className="input-field"
                            value={granularity}
                            onChange={(event) => setGranularity(event.target.value)}
                        >
                            {(data?.granularityOptions || []).map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>Dataset</label>
                        <select
                            className="input-field"
                            value={dataset}
                            onChange={(event) => setDataset(event.target.value)}
                        >
                            {(data?.datasetOptions || []).map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {seriesWithColor.length === 0 || periods.length === 0 ? (
                    <div className="line-chart-empty">Belum ada data untuk kombinasi filter ini.</div>
                ) : (
                    <>
                        <div className="line-chart-legend">
                            {seriesWithColor.map((item) => {
                                const isHidden = hiddenSeriesKeys.includes(item.key);
                                return (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={`line-chart-legend-item${isHidden ? ' is-hidden' : ''}`}
                                    onClick={() => {
                                        setHiddenSeriesKeys((prev) => (
                                            prev.includes(item.key)
                                                ? prev.filter((key) => key !== item.key)
                                                : [...prev, item.key]
                                        ));
                                    }}
                                    aria-pressed={!isHidden}
                                    title={`${isHidden ? 'Tampilkan' : 'Sembunyikan'} ${item.label}`}
                                >
                                    <span className="line-chart-legend-dot" style={{ background: item.color }} />
                                    <span>{item.label}</span>
                                    <strong>{formatCount(item.total)}</strong>
                                </button>
                                );
                            })}
                        </div>

                        {seriesWithPoints.length === 0 ? (
                            <div className="line-chart-empty">Semua garis sedang disembunyikan. Klik legend warna untuk menampilkan lagi.</div>
                        ) : (
                            <div className="line-chart-card">
                            <svg
                                className="line-chart-svg"
                                viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                                role="img"
                                aria-label={`${datasetLabel} berdasarkan ${granularityLabel}`}
                            >
                                {gridTicks.map((tick) => (
                                    <g key={tick.y}>
                                        <line
                                            x1={chartGeometry.padding.left}
                                            x2={chartGeometry.width - chartGeometry.padding.right}
                                            y1={tick.y}
                                            y2={tick.y}
                                            stroke="rgba(255,255,255,0.08)"
                                            strokeDasharray="4 4"
                                        />
                                        <text
                                            x={chartGeometry.padding.left - 8}
                                            y={tick.y + 4}
                                            textAnchor="end"
                                            fontSize="11"
                                            fill="var(--text-muted)"
                                        >
                                            {tick.value}
                                        </text>
                                    </g>
                                ))}

                                {seriesWithPoints.map((seriesItem) => (
                                    <g key={seriesItem.key}>
                                        <path
                                            d={seriesItem.path}
                                            fill="none"
                                            stroke={seriesItem.color}
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        {seriesItem.points.map((point, index) => (
                                            <circle
                                                key={`${seriesItem.key}-${index}`}
                                                cx={point.x}
                                                cy={point.y}
                                                r="4"
                                                fill={seriesItem.color}
                                            />
                                        ))}
                                    </g>
                                ))}

                                {periods.map((period, index) => {
                                    const shouldShowLabel =
                                        index === 0 ||
                                        index === periods.length - 1 ||
                                        index % chartGeometry.xLabelEvery === 0;
                                    if (!shouldShowLabel) {
                                        return null;
                                    }
                                    const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * index : chartGeometry.chartWidth / 2);
                                    return (
                                        <text
                                            key={period.key}
                                            x={x}
                                            y={chartGeometry.height - (chartGeometry.denseXAxis ? 16 : 10)}
                                            textAnchor={chartGeometry.denseXAxis ? 'end' : 'middle'}
                                            fontSize={chartGeometry.denseXAxis ? '8' : '11'}
                                            fill="var(--text-muted)"
                                            transform={chartGeometry.denseXAxis ? `rotate(-45 ${x} ${chartGeometry.height - 16})` : undefined}
                                        >
                                            {period.label}
                                        </text>
                                    );
                                })}
                            </svg>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Accordion>
    );
}
