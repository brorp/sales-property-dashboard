'use client';

import { formatCount as fmt } from './utils';
import './DashboardSections.css';

const SOURCE_COLORS = [
    'var(--primary)',
    '#f59e0b',
    'var(--green)',
    'var(--purple)',
    '#ef4444',
    '#06b6d4',
];

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

function SalesSourceCard({ grp, sourceColumns }) {
    const srcMap = new Map(
        (Array.isArray(grp.bySource) ? grp.bySource : [])
            .map((i) => [normalizeKey(i.source), i.count || 0])
    );

    return (
        <div className="tpc-sales-card">
            <div className="tpc-sales-card-head">
                <span className="tpc-sales-card-name">{grp.salesName || 'Unassigned'}</span>
                <span className="tpc-sales-card-total">{fmt(grp.total)} leads hari ini</span>
            </div>
            {sourceColumns.length > 0 ? (
                <div className="tpc-sales-card-stats">
                    {sourceColumns.map((src, i) => (
                        <div key={src} className="tpc-sales-stat">
                            <span className="tpc-sales-stat-label">{src}</span>
                            <strong
                                className="tpc-sales-stat-value"
                                style={{ color: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                            >
                                {fmt(srcMap.get(normalizeKey(src)) || 0)}
                            </strong>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function DailySalesReportSection({ data }) {
    if (!data) return null;

    const salesRows = Array.isArray(data.leadsBySales) ? data.leadsBySales : [];

    const sourceColumns = Array.from(
        new Map(
            salesRows
                .flatMap((g) => (Array.isArray(g.bySource) ? g.bySource : []))
                .filter((item) => normalizeKey(item.source) !== 'old')
                .map((item) => [normalizeKey(item.source), item.source])
        ).values()
    );

    const totalAssigned = salesRows.reduce((s, g) => s + (g.total || 0), 0);
    const activeSalesRows = salesRows.filter((g) => (g.total || 0) > 0);
    const cols = Math.min(activeSalesRows.length, 5);

    return (
        <div className="dsr-card">
            <div className="dsr-header">
                <div>
                    <span className="dsr-eyebrow">Laporan Harian</span>
                    <h2 className="dsr-title">Daily Sales Report</h2>
                </div>
                <span className="dsr-date">{data.dateLabel || ''}</span>
            </div>

            <div className="dsr-metrics">
                <div className="dsr-metric">
                    <span className="dsr-metric-label">Lead Agent</span>
                    <strong className="dsr-metric-value">{fmt(data.leadAgent)}</strong>
                    <span className="dsr-metric-sub">Hari ini</span>
                </div>
                <div className="dsr-metric dsr-metric--success">
                    <span className="dsr-metric-label">Total Sold</span>
                    <strong className="dsr-metric-value">{fmt(data.totalSold)}</strong>
                    <span className="dsr-metric-sub">Bulan ini</span>
                </div>
                <div className="dsr-metric dsr-metric--warning">
                    <span className="dsr-metric-label">Reserved</span>
                    <strong className="dsr-metric-value">{fmt(data.totalReserved)}</strong>
                    <span className="dsr-metric-sub">Bulan ini</span>
                </div>
            </div>

            <div className="dsr-divider" />

            {activeSalesRows.length === 0 ? (
                <p className="dsr-empty">Tidak ada lead yang assigned hari ini.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div
                        className="tpc-sales-grid"
                        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                    >
                        {activeSalesRows.map((grp) => (
                            <SalesSourceCard
                                key={grp.salesId || grp.salesName}
                                grp={grp}
                                sourceColumns={sourceColumns}
                            />
                        ))}
                    </div>
                    <div className="dsr-sales-footer">
                        <span>Total assigned hari ini</span>
                        <strong>{fmt(totalAssigned)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}
