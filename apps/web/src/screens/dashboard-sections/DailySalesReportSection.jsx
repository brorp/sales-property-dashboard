'use client';

import './DashboardSections.css';

function fmt(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
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
                <div className="dsr-sales-list">
                    <div className="dsr-sales-head">
                        <span>Sales</span>
                        {sourceColumns.map((src) => (
                            <span key={src} className="dsr-col">{src}</span>
                        ))}
                        <span className="dsr-col dsr-col--total">Total</span>
                    </div>
                    {activeSalesRows.map((grp) => {
                        const srcMap = new Map(
                            (Array.isArray(grp.bySource) ? grp.bySource : [])
                                .map((i) => [normalizeKey(i.source), i.count || 0])
                        );
                        return (
                            <div key={grp.salesId || grp.salesName} className="dsr-sales-row">
                                <span className="dsr-sales-name">{grp.salesName || 'Unassigned'}</span>
                                {sourceColumns.map((src) => (
                                    <span key={src} className="dsr-col">
                                        {fmt(srcMap.get(normalizeKey(src)) || 0)}
                                    </span>
                                ))}
                                <strong className="dsr-col dsr-col--total">{fmt(grp.total)}</strong>
                            </div>
                        );
                    })}
                    <div className="dsr-sales-footer">
                        <span>Total assigned hari ini</span>
                        <strong>{fmt(totalAssigned)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}
