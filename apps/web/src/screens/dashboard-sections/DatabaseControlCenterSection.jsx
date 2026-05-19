import { useEffect, useState } from 'react';
import Accordion from '../../components/Accordion';
import LineChartSection from './LineChartSection';
import './DashboardSections.css';

const PIE_COLORS = [
    '#7c4dff',
    '#ff9800',
    '#26a69a',
    '#ef5350',
    '#42a5f5',
    '#ab47bc',
    '#9ccc65',
    '#ffa726',
];

const DEFAULT_STATUS_LAYER_OPTIONS = [
    { key: 'l4', label: 'L4' },
    { key: 'l3', label: 'L3' },
    { key: 'l2', label: 'L2' },
    { key: 'l1', label: 'L1' },
];

function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function getPillButtonStyle(active) {
    return {
        cursor: 'pointer',
        padding: '8px 14px',
        borderRadius: '999px',
        border: active ? 'none' : '1px solid var(--border-color)',
        background: active ? 'var(--primary)' : 'var(--bg-card)',
        color: active ? 'white' : 'var(--text-primary)',
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
    };
}

function getScopeDisplayLabel(scope) {
    if (!scope) {
        return '';
    }

    if (scope.key === 'unassigned_sup' || scope.label === 'Unassigned Supervisor') {
        return 'PIC Agent';
    }

    return scope.label;
}

function buildConicGradient(items) {
    const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
    if (total <= 0) {
        return 'rgba(255,255,255,0.06)';
    }

    let cursor = 0;
    const segments = items
        .filter((item) => item.count > 0)
        .map((item) => {
            const start = (cursor / total) * 360;
            cursor += item.count;
            const end = (cursor / total) * 360;
            return `${item.color} ${start}deg ${end}deg`;
        });

    return `conic-gradient(${segments.join(', ')})`;
}

function ChartCard({ title, subtitle, total, items, emptyLabel = 'Belum ada data', chartType = 'pie', onItemClick, activeKeys = [] }) {
    const chartItems = items.filter((item) => item.count > 0);
    const activeSet = new Set(activeKeys || []);

    return (
        <div
            style={{
                padding: '18px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h4>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</span>
            </div>

            {chartItems.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 220px) 1fr',
                        gap: '20px',
                        alignItems: 'center',
                    }}
                >
                    {chartType === 'bar' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {chartItems.map((item) => {
                                const percentage = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                                const isActive = activeSet.size === 0 || activeSet.has(item.key);
                                return (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onClick={() => onItemClick?.(item.key)}
                                        style={{
                                            border: isActive ? '1px solid var(--border-color)' : '1px solid rgba(255,255,255,0.05)',
                                            background: isActive ? 'var(--bg-input)' : 'rgba(148, 163, 184, 0.08)',
                                            opacity: isActive ? 1 : 0.48,
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            cursor: onItemClick ? 'pointer' : 'default',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>
                                            <span>{item.label}</span>
                                            <span>{formatCount(item.count)} · {percentage}%</span>
                                        </div>
                                        <div className="mini-progress-bar" style={{ marginTop: 8 }}>
                                            <div className="mini-progress-fill" style={{ width: `${Math.max(4, percentage)}%`, backgroundColor: item.color }} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div
                            style={{
                                width: '180px',
                                height: '180px',
                                borderRadius: '50%',
                                background: buildConicGradient(chartItems),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                            }}
                        >
                            <div
                                style={{
                                    width: '96px',
                                    height: '96px',
                                    borderRadius: '50%',
                                    background: 'var(--bg-app)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    padding: '8px',
                                }}
                            >
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
                                <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>{formatCount(total)}</strong>
                            </div>
                        </div>
                    </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {chartItems.map((item) => {
                            const percentage = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                            const isActive = activeSet.size === 0 || activeSet.has(item.key);
                            return (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => onItemClick?.(item.key)}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto 1fr auto auto',
                                        gap: '10px',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        border: isActive ? '1px solid transparent' : '1px solid rgba(255,255,255,0.05)',
                                        background: isActive ? 'var(--bg-input)' : 'rgba(148, 163, 184, 0.08)',
                                        opacity: isActive ? 1 : 0.48,
                                        cursor: onItemClick ? 'pointer' : 'default',
                                        textAlign: 'left',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '999px',
                                            background: item.color,
                                            display: 'inline-block',
                                        }}
                                    />
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                                    <strong style={{ color: 'var(--text-primary)' }}>{formatCount(item.count)}</strong>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{percentage}%</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function RankedInsightPanel({ title, items, emptyLabel, renderLabel }) {
    return (
        <div className="chart-box">
            <h4>{title}</h4>
            <div className="section-team-list" style={{ gap: '12px' }}>
                {items && items.length > 0 ? (
                    items.map((item, index) => (
                        <div key={`${title}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.85rem' }}>
                                <span>{renderLabel(item)}</span>
                                <strong>{formatCount(item.count)}{item.percentage !== undefined ? ` (${item.percentage}%)` : ''}</strong>
                            </div>
                            <div className="mini-progress-bar">
                                <div
                                    className="mini-progress-fill"
                                    style={{
                                        width: `${Math.max(6, Math.min(100, Number(item.percentage || 0)))}%`,
                                        backgroundColor: 'var(--primary-light)',
                                    }}
                                />
                            </div>
                        </div>
                    ))
                ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{emptyLabel}</span>
                )}
            </div>
        </div>
    );
}

export default function DatabaseControlCenterSection({
    data,
    dateFilterControl = null,
    allowScopeFiltering = true,
    scopeLabel = 'Semua',
}) {
    const [selectedLayer, setSelectedLayer] = useState('l4');
    const [selectedScope, setSelectedScope] = useState('all');
    const [chartType, setChartType] = useState('pie');
    const [activeLineSeriesKeys, setActiveLineSeriesKeys] = useState([]);

    useEffect(() => {
        setActiveLineSeriesKeys([]);
    }, [selectedLayer, selectedScope]);

    if (!data) return null;

    const topSource = data.sourceBreakdown?.[0]?.source || '-';
    const topDomicile = data.domicileBreakdown?.[0]?.city || '-';
    const summary = `${data.totalData || 0} Total Data`;
    const scopeOptions = data.scopeOptions || [];
    const layerOptions = (data.statusLayerOptions || DEFAULT_STATUS_LAYER_OPTIONS)
        .slice()
        .sort((a, b) => {
            const order = { l4: 0, l3: 1, l2: 2, l1: 3 };
            return (order[a.key] ?? 99) - (order[b.key] ?? 99);
        });
    const effectiveScopeKey = allowScopeFiltering ? selectedScope : 'all';
    const selectedScopeOption = scopeOptions.find((item) => item.key === effectiveScopeKey) || null;
    const selectedScopeData = data.statusLayerBreakdown?.[effectiveScopeKey] || data.statusLayerBreakdown?.all || null;
    const selectedLayerMeta = layerOptions.find((item) => item.key === selectedLayer) || layerOptions[0] || DEFAULT_STATUS_LAYER_OPTIONS[0];
    const filteredTotal = selectedScopeData?.totalData || 0;
    const effectiveScopeLabel = allowScopeFiltering
        ? effectiveScopeKey === 'all'
            ? 'Semua'
            : getScopeDisplayLabel(selectedScopeOption)
        : scopeLabel;
    const statusLayerItems = (selectedScopeData?.layers?.[selectedLayer] || []).map((item, index) => ({
        ...item,
        color: PIE_COLORS[index % PIE_COLORS.length],
    }));
    const selectedLayerSeriesKeys = statusLayerItems.map((item) => item.key);
    const hiddenLineSeriesKeys = activeLineSeriesKeys.length > 0
        ? selectedLayerSeriesKeys.filter((key) => !activeLineSeriesKeys.includes(key))
        : [];

    const toggleLineStatus = (key) => {
        if (!key) {
            return;
        }
        setActiveLineSeriesKeys((prev) => {
            if (prev.length === 0) {
                return [key];
            }
            if (prev.includes(key)) {
                const next = prev.filter((item) => item !== key);
                return next.length === 0 ? [] : next;
            }
            return [...prev, key];
        });
    };

    return (
        <Accordion title="Database Control Center" summary={summary} defaultExpanded={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Analisa Status Database Leads</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                Chart mengikuti filter layer status dan supervisor yang dipilih.
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['pie', 'bar'].map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setChartType(type)}
                                    style={getPillButtonStyle(chartType === type)}
                                >
                                    {type === 'pie' ? 'Pie Chart' : 'Bar Chart'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {dateFilterControl}

                    {allowScopeFiltering ? (
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedScope('all')}
                                style={getPillButtonStyle(selectedScope === 'all')}
                            >
                                Semua
                            </button>
                            {scopeOptions.map((scope) => (
                                <button
                                    key={scope.key}
                                    type="button"
                                    onClick={() => setSelectedScope(scope.key)}
                                    style={getPillButtonStyle(selectedScope === scope.key)}
                                >
                                    {getScopeDisplayLabel(scope)}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                    {layerOptions.map((layer) => (
                        <button
                            key={layer.key}
                            type="button"
                            onClick={() => setSelectedLayer(layer.key)}
                            style={getPillButtonStyle(selectedLayer === layer.key)}
                        >
                            {layer.label}
                        </button>
                    ))}
                </div>

                <div className="section-stats-grid">
                    <div className="section-stat-card" style={{ gridColumn: '1 / -1', background: 'var(--primary-light)', borderColor: 'var(--primary)' }}>
                        <span className="section-stat-label" style={{ color: 'var(--purple)' }}>
                            {allowScopeFiltering
                                ? effectiveScopeKey === 'all'
                                    ? 'Total Database Keseluruhan'
                                    : `Total Database ${effectiveScopeLabel}`
                                : `Total Database ${effectiveScopeLabel}`}
                        </span>
                        <span className="section-stat-value" style={{ fontSize: '2.5rem', color: 'white' }}>{filteredTotal}</span>
                    </div>
                </div>

                <ChartCard
                    title={`Distribusi Status ${selectedLayerMeta?.label || 'L1'}`}
                    subtitle={`Klik status untuk fokus line chart di bawah. Komposisi untuk ${effectiveScopeLabel} berdasarkan layer ${selectedLayerMeta?.label || 'L1'}.`}
                    total={filteredTotal}
                    items={statusLayerItems}
                    chartType={chartType}
                    activeKeys={activeLineSeriesKeys}
                    onItemClick={toggleLineStatus}
                    emptyLabel="Belum ada data pada filter ini."
                />

                <LineChartSection
                    data={data.lineChart}
                    title={`Line Chart ${selectedLayerMeta?.label || 'L4'}`}
                    defaultExpanded={false}
                    datasetOverride={selectedLayer}
                    hideDatasetControl
                    hiddenSeriesKeys={hiddenLineSeriesKeys}
                    onToggleSeries={toggleLineStatus}
                    inline
                />
            </div>

            <div className="chart-container-row chart-container-row-four" style={{ marginTop: '24px' }}>
                <RankedInsightPanel
                    title="Top Domisili"
                    items={data.domicileBreakdown?.slice(0, 10) || []}
                    emptyLabel="Belum ada data domisili"
                    renderLabel={(item) => item.city}
                />

                <RankedInsightPanel
                    title="Distribusi Sumber Data"
                    items={data.sourceBreakdown || []}
                    emptyLabel="Belum ada data source"
                    renderLabel={(item) => item.source}
                />

                <RankedInsightPanel
                    title="Tipe Unit"
                    items={data.unitTypeBreakdown || []}
                    emptyLabel="Belum ada tipe unit"
                    renderLabel={(item) => item.label || item.unitType}
                />

                <RankedInsightPanel
                    title="Alasan Cancel"
                    items={data.cancelReasonBreakdown || []}
                    emptyLabel="Belum ada data cancel"
                    renderLabel={(item) => item.label || item.key}
                />
            </div>
        </Accordion>
    );
}
