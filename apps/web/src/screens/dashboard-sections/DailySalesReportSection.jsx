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

export default function DailySalesReportSection({ data }) {
    if (!data) {
        return null;
    }

    const salesRows = Array.isArray(data.onlineLeads?.bySales)
        ? data.onlineLeads.bySales
        : [];

    return (
        <Accordion
            title={data.title || `Daily Sales Report ${data.dateLabel || ''}`}
            summary={`${formatCount(data.onlineLeads?.total)} Online assigned · ${formatCount(data.totalSold)} sold bulan ini`}
            defaultExpanded
        >
            <div className="daily-sales-report-shell">
                <div className="daily-sales-report-top">
                    <ReportMetric label="Walk In" value={data.walkIn} />
                    <ReportMetric label="Call In" value={data.callIn} />
                    <ReportMetric label="Lead Agent" value={data.leadAgent} />
                </div>

                <div className="daily-sales-report-main">
                    <div className="daily-sales-report-card daily-sales-report-card-leads">
                        <div className="daily-sales-report-card-head">
                            <span>Leads Online Assigned</span>
                            <strong>{formatCount(data.onlineLeads?.total)}</strong>
                        </div>
                        {salesRows.length > 0 ? (
                            <div className="daily-sales-report-sales-list">
                                {salesRows.map((item) => (
                                    <div key={item.salesId || item.salesName} className="daily-sales-report-sales-row">
                                        <span>{item.salesName || 'Unassigned'}</span>
                                        <strong>{formatCount(item.count)}</strong>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="daily-sales-report-empty">Belum ada lead Online yang assigned hari ini.</p>
                        )}
                    </div>

                    <div className="daily-sales-report-card daily-sales-report-card-transaction">
                        <ReportMetric label="Total Sold" value={data.totalSold} tone="success" />
                        <ReportMetric label="Total Reserved" value={data.totalReserved} tone="warning" />
                    </div>
                </div>
            </div>
        </Accordion>
    );
}
