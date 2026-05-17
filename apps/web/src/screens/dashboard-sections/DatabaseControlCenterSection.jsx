import { formatCount } from './utils';
import PieChartCard from '../../components/PieChartCard';
import './DashboardSections.css';

const PIE_COLORS = ['#7c4dff', '#ff9800', '#26a69a', '#ef5350', '#42a5f5', '#ab47bc', '#9ccc65', '#ffa726'];
const DEFAULT_STATUS_LAYER_OPTIONS = [{ key: 'l1', label: 'L1' }, { key: 'l2', label: 'L2' }, { key: 'l3', label: 'L3' }, { key: 'l4', label: 'L4' }];

function getScopeDisplayLabel(scope) {
    if (!scope) return '';
    if (scope.key === 'unassigned_sup' || scope.label === 'Unassigned Supervisor') return 'PIC Agent';
    return scope.label;
}

const RANK_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];

function RankedPanel({ title, items, emptyLabel, renderLabel }) {
    const counts = (items || []).map((item) => Number(item.count || 0));
    const max = counts.length > 0 ? Math.max(...counts) : 1;

    return (
        <div className="rnk-panel">
            <h4 className="rnk-title">{title}</h4>
            {items && items.length > 0 ? (
                <div className="rnk-list">
                    {items.map((item, i) => {
                        const rankColor = RANK_COLORS[i] || null;
                        const barPct = max > 0 ? Math.round((Number(item.count || 0) / max) * 100) : 0;
                        const displayPct = item.percentage !== undefined ? `${item.percentage}%` : null;
                        return (
                            <div key={i} className="rnk-item">
                                <div className="rnk-item-row">
                                    <span
                                        className="rnk-badge"
                                        style={rankColor ? { background: rankColor, color: '#fff', borderColor: rankColor } : {}}
                                    >
                                        {i + 1}
                                    </span>
                                    <span className="rnk-label">{renderLabel(item)}</span>
                                    <strong className="rnk-count">{formatCount(item.count)}</strong>
                                    {displayPct ? <span className="rnk-pct">{displayPct}</span> : null}
                                </div>
                                <div className="rnk-bar-track">
                                    <div
                                        className="rnk-bar-fill"
                                        style={{
                                            width: `${Math.max(3, barPct)}%`,
                                            background: rankColor || 'var(--primary)',
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <span className="rnk-empty">{emptyLabel}</span>
            )}
        </div>
    );
}

export default function DatabaseControlCenterSection({
    data, allowScopeFiltering = true, scopeLabel = 'Semua', selectedTeam = 'all', selectedLayer = 'l1',
}) {

    if (!data) return null;

    const scopeOptions = data.scopeOptions || [];
    const layerOptions = data.statusLayerOptions || DEFAULT_STATUS_LAYER_OPTIONS;
    const effectiveScopeKey = allowScopeFiltering ? selectedTeam : 'all';
    const selectedScopeOption = scopeOptions.find((item) => item.key === effectiveScopeKey) || null;
    const selectedScopeData = data.statusLayerBreakdown?.[effectiveScopeKey] || data.statusLayerBreakdown?.all || null;
    const selectedLayerMeta = layerOptions.find((item) => item.key === selectedLayer) || layerOptions[0] || DEFAULT_STATUS_LAYER_OPTIONS[0];
    const filteredTotal = selectedScopeData?.totalData || 0;
    const effectiveScopeLabel = allowScopeFiltering
        ? effectiveScopeKey === 'all' ? 'Semua' : getScopeDisplayLabel(selectedScopeOption)
        : scopeLabel;
    const statusLayerItems = (selectedScopeData?.layers?.[selectedLayer] || []).map((item, i) => ({ ...item, color: PIE_COLORS[i % PIE_COLORS.length] }));

    return (
        <div className="ds-card">
            <div className="ds-card-head">
                <div>
                    <h2 className="ds-card-title">Database Control Center</h2>
                    <span className="ds-card-summary">{data.totalData || 0} Total Data</span>
                </div>
            </div>

            <div className="ds-tab-body">
                {/* Pie chart */}
                <PieChartCard
                    title={`Distribusi Status ${selectedLayerMeta?.label || 'L1'}`}
                    subtitle={`Komposisi status leads untuk ${effectiveScopeLabel} berdasarkan layer ${selectedLayerMeta?.label || 'L1'}.`}
                    total={filteredTotal}
                    items={statusLayerItems}
                    emptyLabel="Belum ada data pada filter ini."
                />

                {/* Ranked insights */}
                <div className="chart-container-row">
                    <RankedPanel title="Top Domisili" items={data.domicileBreakdown?.slice(0, 10) || []} emptyLabel="Belum ada data domisili" renderLabel={(item) => item.city} />
                    <RankedPanel title="Distribusi Sumber Data" items={data.sourceBreakdown || []} emptyLabel="Belum ada data source" renderLabel={(item) => item.source} />
                    <RankedPanel title="Alasan Cancel" items={data.cancelReasonBreakdown || []} emptyLabel="Belum ada data cancel" renderLabel={(item) => item.label || item.key} />
                </div>
            </div>
        </div>
    );
}
