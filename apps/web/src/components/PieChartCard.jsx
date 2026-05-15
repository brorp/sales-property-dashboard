import { buildConicGradient, formatCount } from '../screens/dashboard-sections/utils';
import './PieChartCard.css';

export default function PieChartCard({ title, subtitle, total, items = [], emptyLabel = 'Belum ada data' }) {
    const chartItems = items.filter((item) => item.count > 0);

    return (
        <div className="pcc">
            <div className="pcc-header">
                <h4 className="pcc-title">{title}</h4>
                {subtitle ? <span className="pcc-subtitle">{subtitle}</span> : null}
            </div>

            {chartItems.length === 0 ? (
                <div className="pcc-empty">{emptyLabel}</div>
            ) : (
                <div className="pcc-body">
                    <div className="pcc-donut-wrap">
                        <div className="pcc-donut" style={{ background: buildConicGradient(chartItems) }}>
                            <div className="pcc-donut-hole">
                                <span className="pcc-donut-label">Total</span>
                                <strong className="pcc-donut-total">{formatCount(total)}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="pcc-legend">
                        {chartItems.map((item) => {
                            const pct = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                            return (
                                <div key={item.label} className="pcc-legend-item">
                                    <div className="pcc-legend-row">
                                        <span className="pcc-legend-dot" style={{ background: item.color }} />
                                        <span className="pcc-legend-name">{item.label}</span>
                                        <span className="pcc-legend-count">{formatCount(item.count)}</span>
                                        <span className="pcc-legend-pct">{pct}%</span>
                                    </div>
                                    <div className="pcc-legend-bar-track">
                                        <div className="pcc-legend-bar-fill" style={{ width: `${pct}%`, background: item.color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
