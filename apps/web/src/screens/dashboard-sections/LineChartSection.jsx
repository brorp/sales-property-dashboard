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

export default function LineChartSection({ data }) {
    const [granularity, setGranularity] = useState(data?.defaultGranularity || 'month');
    const [dataset, setDataset] = useState(data?.defaultDataset || 'l4');

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
    const nonZeroSeries = series.filter((item) => Number(item.total || 0) > 0);

    const chartGeometry = useMemo(() => {
        const width = 720;
        const height = 280;
        const padding = { top: 16, right: 16, bottom: 38, left: 36 };
        const maxValue = Math.max(
            1,
            ...periods.flatMap((period) => Object.values(period.values || {}).map((value) => Number(value || 0)))
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
        };
    }, [periods]);

    const seriesWithPoints = useMemo(() => {
        return nonZeroSeries.map((seriesItem, index) => {
            const points = periods.map((period, periodIndex) => {
                const rawValue = Number(period.values?.[seriesItem.key] || 0);
                const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * periodIndex : chartGeometry.chartWidth / 2);
                const y = chartGeometry.padding.top + chartGeometry.chartHeight - ((rawValue / chartGeometry.maxValue) * chartGeometry.chartHeight);
                return { x, y, value: rawValue, label: period.label };
            });

            return {
                ...seriesItem,
                color: LINE_COLORS[index % LINE_COLORS.length],
                points,
                path: buildPath(points),
            };
        });
    }, [chartGeometry.chartHeight, chartGeometry.chartWidth, chartGeometry.maxValue, chartGeometry.padding.left, chartGeometry.padding.top, chartGeometry.xStep, nonZeroSeries, periods]);

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
            summary={`Tren ${datasetLabel.toLowerCase()} per ${granularityLabel.toLowerCase()}`}
            defaultExpanded={false}
        >
            <div className="line-chart-shell">
                <div className="line-chart-controls">
                    <div className="input-group">
                        <label>Granularity</label>
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

                {seriesWithPoints.length === 0 || periods.length === 0 ? (
                    <div className="line-chart-empty">Belum ada data untuk kombinasi filter ini.</div>
                ) : (
                    <>
                        <div className="line-chart-legend">
                            {seriesWithPoints.map((item) => (
                                <div key={item.key} className="line-chart-legend-item">
                                    <span className="line-chart-legend-dot" style={{ background: item.color }} />
                                    <span>{item.label}</span>
                                    <strong>{formatCount(item.total)}</strong>
                                </div>
                            ))}
                        </div>

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
                                    const x = chartGeometry.padding.left + (periods.length > 1 ? chartGeometry.xStep * index : chartGeometry.chartWidth / 2);
                                    return (
                                        <text
                                            key={period.key}
                                            x={x}
                                            y={chartGeometry.height - 10}
                                            textAnchor="middle"
                                            fontSize="11"
                                            fill="var(--text-muted)"
                                        >
                                            {period.label}
                                        </text>
                                    );
                                })}
                            </svg>
                        </div>
                    </>
                )}
            </div>
        </Accordion>
    );
}
