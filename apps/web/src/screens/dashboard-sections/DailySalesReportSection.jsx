'use client';

import Accordion from '../../components/Accordion';
import './DashboardSections.css';

function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function ReportMetric({ label, value, tone = 'neutral' }) {
    return (
        <div className={`daily-sales-report-metric daily-sales-report-metric-${tone}`}>
            <span>{label}</span>
            <strong>{formatCount(value)}</strong>
        </div>
    );
}

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

export default function DailySalesReportSection({ data }) {
    if (!data) {
        return null;
    }

    const salesRows = Array.isArray(data.leadsBySales) ? data.leadsBySales : [];
    const sourceColumns = Array.from(
        new Map(
            salesRows
                .flatMap((salesGrp) => Array.isArray(salesGrp.bySource) ? salesGrp.bySource : [])
                .map((item) => [normalizeKey(item.source), item.source || 'Lainnya'])
        ).values()
    ).filter(source => normalizeKey(source) !== 'old');
    const effectiveSourceColumns = sourceColumns.length > 0 ? sourceColumns : ['Total non-Agent'];
    const sourceTotalMap = new Map();
    for (const salesGrp of salesRows) {
        for (const item of Array.isArray(salesGrp.bySource) ? salesGrp.bySource : []) {
            const sourceKey = normalizeKey(item.source);
            sourceTotalMap.set(sourceKey, (sourceTotalMap.get(sourceKey) || 0) + Number(item.count || 0));
        }
    }
    const gridTemplateColumns = `minmax(180px, 1.5fr) repeat(${effectiveSourceColumns.length}, minmax(86px, 1fr))`;
    const gridMinWidth = Math.max(560, 220 + effectiveSourceColumns.length * 104);
    const totalAssigned = Array.isArray(data.leadsBySales)
        ? data.leadsBySales.reduce((sum, g) => sum + (g.total || 0), 0)
        : Array.isArray(data.leadsBySource)
            ? data.leadsBySource.reduce((sum, g) => sum + (g.total || 0), 0)
            : 0;

    return (
        <Accordion
            title={data.title || `Daily Sales Report ${data.dateLabel || ''}`}
            summary={`${formatCount(totalAssigned)} Leads assigned · ${formatCount(data.totalSold)} sold bulan ini`}
            defaultExpanded
        >
            <div className="daily-sales-report-shell">
                <div className="daily-sales-report-top" style={{ gridTemplateColumns: '1fr' }}>
                    <ReportMetric label="Lead Agent" value={data.leadAgent} />
                </div>

                <div className="daily-sales-report-main" style={{ gridTemplateColumns: '1fr' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {salesRows.length > 0 ? (
                            <div className="daily-sales-report-card daily-sales-report-card-leads">
                                <div className="daily-sales-report-card-head" style={{ paddingBottom: '8px', justifyContent: 'space-between' }}>
                                    <span>Leads Assigned by Sales</span>
                                    <strong style={{ textAlign: 'right', paddingRight: '24px' }}>{formatCount(totalAssigned)}</strong>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns,
                                            gap: '10px',
                                            alignItems: 'center',
                                            minWidth: `${gridMinWidth}px`,
                                            padding: '12px 2px 16px',
                                        }}
                                    >
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Sales
                                        </span>
                                        {effectiveSourceColumns.map((source) => (
                                            <span
                                                key={source}
                                                style={{
                                                    color: 'var(--text-muted)',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    textAlign: 'center',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                }}
                                            >
                                                {source} ({formatCount(sourceTotalMap.get(normalizeKey(source)) || 0)})
                                            </span>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: `${gridMinWidth}px` }}>
                                        {salesRows.map((salesGrp) => {
                                            const sourceCountMap = new Map(
                                                (Array.isArray(salesGrp.bySource) ? salesGrp.bySource : [])
                                                    .map((item) => [normalizeKey(item.source), Number(item.count || 0)])
                                            );

                                            return (
                                                <div
                                                    key={salesGrp.salesId || salesGrp.salesName}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns,
                                                        gap: '10px',
                                                        alignItems: 'center',
                                                        padding: '9px 14px',
                                                        borderRadius: '10px',
                                                        background: 'var(--bg-input)',
                                                        border: '1px solid var(--border-color)',
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                                                            {salesGrp.salesName || 'Unassigned'}
                                                        </strong>
                                                    </div>

                                                    {effectiveSourceColumns.map((source) => (
                                                        <strong key={`${salesGrp.salesId}-${source}`} style={{ color: 'var(--text-primary)', textAlign: 'center' }}>
                                                            {formatCount(sourceCountMap.get(normalizeKey(source)) || 0)}
                                                        </strong>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : Array.isArray(data.leadsBySource) && data.leadsBySource.length > 0 ? (
                            data.leadsBySource.map(sourceGrp => (
                                <div key={sourceGrp.source} className="daily-sales-report-card daily-sales-report-card-leads">
                                    <div className="daily-sales-report-card-head">
                                        <span>Leads {sourceGrp.source} Assigned</span>
                                        <strong>{formatCount(sourceGrp.total)}</strong>
                                    </div>
                                    {Array.isArray(sourceGrp.bySales) && sourceGrp.bySales.length > 0 ? (
                                        <div className="daily-sales-report-sales-list">
                                            {sourceGrp.bySales.map((item) => (
                                                <div key={item.salesId || item.salesName} className="daily-sales-report-sales-row">
                                                    <span>{item.salesName || 'Unassigned'}</span>
                                                    <strong>{formatCount(item.count)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="daily-sales-report-empty">Belum ada lead {sourceGrp.source} yang assigned hari ini.</p>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="daily-sales-report-card daily-sales-report-card-leads">
                                <p className="daily-sales-report-empty">Belum ada lead yang assigned hari ini.</p>
                            </div>
                        )}
                    </div>

                    <div className="daily-sales-report-card daily-sales-report-card-transaction" style={{ maxWidth: 'none' }}>
                        <span>Bulan Ini</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                            <ReportMetric label="Total Sold" value={data.totalSold} tone="success" />
                            <ReportMetric label="Total Reserved" value={data.totalReserved} tone="warning" />
                        </div>
                    </div>
                </div>
            </div>
        </Accordion>
    );
}
