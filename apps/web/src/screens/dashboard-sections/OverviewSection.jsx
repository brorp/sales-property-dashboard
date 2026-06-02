import { useMemo, useState } from 'react';
import { formatCount } from './utils';
import Select from '../../components/Select';
import './DashboardSections.css';

function fmt(n) { return formatCount(n); }
function pctStr(n) { return `${Number(n || 0).toFixed(1)}%`; }

function getTeamDisplayName(team) {
    if (team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor') return 'Unassigned';
    return team.teamName;
}

function KpiCard({ label, value, sub, accent }) {
    return (
        <div className={`ov-kpi-card ov-kpi-card--${accent}`}>
            <span className="ov-kpi-label">{label}</span>
            <span className="ov-kpi-value">{value}</span>
            {sub ? <span className="ov-kpi-sub">{sub}</span> : null}
        </div>
    );
}

function PipelineCard({ label, value, color }) {
    return (
        <div className="ov-pipeline-card">
            <span className="ov-pipeline-label">{label}</span>
            <span className="ov-pipeline-value" style={{ color }}>{value}</span>
        </div>
    );
}

export default function OverviewSection({
    surveyRatio,
    statusPie,
    transactionRecap,
    resultRecap,
    dailySalesReport,
    ongoingAppointments,
    perAgentSurveyRatio,
}) {
    const [selectedMetrics, setSelectedMetrics] = useState(['database', 'visit', 'transaksi']);
    const totalLeads = surveyRatio?.totalLeads || 0;
    const surveyedLeads = surveyRatio?.surveyedLeads || 0;
    const surveyRatioPercent = surveyRatio?.ratioPercent || 0;

    const hotItem = statusPie?.items?.find((i) => i.key === 'hot');
    const hotCount = hotItem?.count || 0;
    const hotPct = hotItem?.percentage || 0;

    const totalReserve = transactionRecap?.totalReserve || 0;
    const totalFullBook = transactionRecap?.totalFullBook || 0;
    const totalAkad = transactionRecap?.totalAkad || 0;
    const totalCancelFB = resultRecap?.items?.find((i) => i.key === 'cancel_full_book')?.count || 0;
    const totalCancelReserve = resultRecap?.items?.find((i) => i.key === 'cancel_reserve')?.count || 0;
    const activePipeline = totalReserve + totalFullBook;
    const totalClosing = totalFullBook + totalAkad;
    const closingPct = totalLeads > 0 ? (totalClosing / totalLeads) * 100 : 0;

    const todayLeads = useMemo(() => {
        if (!dailySalesReport?.leadsBySales) return 0;
        return dailySalesReport.leadsBySales.reduce((acc, s) => acc + (s.total || 0), 0);
    }, [dailySalesReport]);

    const walkIn = dailySalesReport?.walkIn || 0;
    const callIn = dailySalesReport?.callIn || 0;
    const inHouse = dailySalesReport?.inHouse || 0;
    const agent = dailySalesReport?.agent || 0;
    const todayStr = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);
    const appointmentCount = useMemo(
        () => (ongoingAppointments || []).filter((a) => a.date === todayStr).length,
        [ongoingAppointments, todayStr],
    );
    const totalReserved = dailySalesReport?.totalReserved || 0;

    const funnelSteps = [
        { key: 'total', label: 'Total Leads', count: totalLeads, pct: 100 },
        { key: 'hot', label: 'Hot', count: hotCount, pct: totalLeads > 0 ? (hotCount / totalLeads) * 100 : 0 },
        { key: 'survey', label: 'Survey', count: surveyedLeads, pct: totalLeads > 0 ? (surveyedLeads / totalLeads) * 100 : 0 },
        { key: 'transaksi', label: 'Transaksi', count: activePipeline, pct: totalLeads > 0 ? (activePipeline / totalLeads) * 100 : 0 },
        { key: 'lunas', label: 'Lunas', count: totalAkad, pct: totalLeads > 0 ? (totalAkad / totalLeads) * 100 : 0 },
    ];

    const teams = useMemo(() => {
        if (!transactionRecap?.teams) return [];
        return transactionRecap.teams.filter((t) => (t.prospek || 0) > 0);
    }, [transactionRecap]);

    const cancelReasons = resultRecap?.cancelReasons?.items?.slice(0, 4) || [];

    const allSalesData = useMemo(() => {
        const list = [];
        const seen = new Set();
        const teamsList = teams || [];
        for (const team of teamsList) {
            for (const s of (team.sales || [])) {
                if (seen.has(s.salesId)) continue;
                seen.add(s.salesId);

                const closing = (s.fullBook || 0) + (s.akad || 0);
                const prospek = s.prospek || 0;

                list.push({
                    salesId: s.salesId,
                    salesName: s.salesName,
                    prospek,
                    survey: s.survey || 0,
                    hot: s.hot || 0,
                    closing,
                    databasePct: totalLeads > 0 ? (prospek / totalLeads) * 100 : 0,
                    surveyPct: prospek > 0 ? ((s.survey || 0) / prospek) * 100 : 0,
                    closingPct: prospek > 0 ? (closing / prospek) * 100 : 0,
                    hotPct: prospek > 0 ? ((s.hot || 0) / prospek) * 100 : 0,
                });
            }
        }

        if (list.length === 0 && perAgentSurveyRatio?.length) {
            for (const s of perAgentSurveyRatio) {
                const prospek = s.totalLeads || 0;
                list.push({
                    salesId: s.salesId,
                    salesName: s.salesName,
                    prospek,
                    survey: s.surveyedLeads || 0,
                    hot: 0,
                    closing: 0,
                    databasePct: totalLeads > 0 ? (prospek / totalLeads) * 100 : 0,
                    surveyPct: s.ratioPercent || 0,
                    closingPct: 0,
                    hotPct: 0,
                });
            }
        }

        return list;
    }, [teams, perAgentSurveyRatio, totalLeads]);

    const sortedSales = useMemo(() => {
        const list = [...allSalesData];
        const primaryFilter = selectedMetrics[0] || 'visit';
        list.sort((a, b) => {
            let valA = 0;
            let valB = 0;
            if (primaryFilter === 'database') { valA = a.databasePct; valB = b.databasePct; }
            else if (primaryFilter === 'visit') { valA = a.surveyPct; valB = b.surveyPct; }
            else if (primaryFilter === 'transaksi') { valA = a.closingPct; valB = b.closingPct; }
            else if (primaryFilter === 'hot') { valA = a.hotPct; valB = b.hotPct; }

            if (valB !== valA) return valB - valA;
            return a.salesName.localeCompare(b.salesName);
        });
        return list;
    }, [allSalesData, selectedMetrics]);

    return (
        <div className="ov-wrap">
            {/* 1 — Daily Pulse + Pipeline Aktif */}
            <div className="ov-two-col">
                {dailySalesReport ? (
                    <div className="ov-card">
                        <div className="ov-card-head">
                            <div>
                                <div className="ov-eyebrow-row">
                                    <span className="ov-eyebrow">Hari Ini</span>
                                    <span className="ov-date-badge">{dailySalesReport.dateLabel}</span>
                                </div>
                                <h3 className="ov-card-title">Database</h3>
                            </div>
                        </div>
                        <div className="ov-pulse-grid">
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Walk In</span>
                                <span className="ov-pulse-value">{fmt(walkIn)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Call In</span>
                                <span className="ov-pulse-value">{fmt(callIn)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Lead Online</span>
                                <span className="ov-pulse-value">{fmt(todayLeads)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Lead Offline</span>
                                <span className="ov-pulse-value">{fmt(appointmentCount)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Inhouse</span>
                                <span className="ov-pulse-value">{fmt(inHouse)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Agent</span>
                                <span className="ov-pulse-value">{fmt(agent)}</span>
                            </div>
                            <div className="ov-pulse-item ov-pulse-item--accent">
                                <span className="ov-pulse-label">Visit</span>
                                <span className="ov-pulse-value">{fmt(totalReserved)}</span>
                            </div>
                        </div>
                    </div>
                ) : <div />}

                <div className="ov-card">
                    <div className="ov-card-head">
                        <div>
                            <span className="ov-eyebrow">Status Transaksi</span>
                            <h3 className="ov-card-title">Pipeline Aktif</h3>
                        </div>
                    </div>
                    <div className="ov-pipeline-layout">
                        <div className="ov-pipeline-row-full">
                            <PipelineCard label="Akad" value={fmt(totalAkad)} color="#16A34A" />
                        </div>
                        <div className="ov-pipeline-row-split">
                            <PipelineCard label="Full Book" value={fmt(totalFullBook)} color="#7C3AED" />
                            <PipelineCard label="Cancel FB" value={fmt(totalCancelFB)} color="#EF4444" />
                        </div>
                        <div className="ov-pipeline-row-split">
                            <PipelineCard label="Reserve" value={fmt(totalReserve)} color="var(--text-secondary)" />
                            <PipelineCard label="Cancel Reserve" value={fmt(totalCancelReserve)} color="#F97316" />
                        </div>
                    </div>
                </div>
            </div>

            {/* 2 — Team Snapshot */}
            {teams.length > 0 ? (
                <div className="ov-card">
                    <div className="ov-card-head">
                        <div>
                            <span className="ov-eyebrow">Tim</span>
                            <h3 className="ov-card-title">Snapshot Performa Tim</h3>
                        </div>
                    </div>
                    <div className="ov-team-table">
                        <div className="ov-team-row ov-team-row--head">
                            <span className="ov-team-cell ov-team-cell--name">Tim</span>
                            <span className="ov-team-cell">Leads</span>
                            <span className="ov-team-cell ov-tc-hide-sm">Hot</span>
                            <span className="ov-team-cell ov-tc-hide-sm">Survey</span>
                            <span className="ov-team-cell">Closing</span>
                            <span className="ov-team-cell">Tingkat Closing</span>
                        </div>
                        {teams.map((team) => {
                            const teamClosing = (team.fullBook || 0) + (team.akad || 0);
                            return (
                                <div key={team.teamId} className="ov-team-row">
                                    <span className="ov-team-cell ov-team-cell--name">{getTeamDisplayName(team)}</span>
                                    <span className="ov-team-cell">{fmt(team.prospek || 0)}</span>
                                    <span className="ov-team-cell ov-team-cell--hot ov-tc-hide-sm">{fmt(team.hot || 0)}</span>
                                    <span className="ov-team-cell ov-tc-hide-sm">{fmt(team.survey || 0)}</span>
                                    <span className="ov-team-cell ov-team-cell--closing">{fmt(teamClosing)}</span>
                                    <span className="ov-team-cell">{pctStr(team.closingRate || 0)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* 3 — Concern Area */}
            <div className="ov-two-col">
                {cancelReasons.length > 0 ? (
                    <div className="ov-card">
                        <div className="ov-card-head">
                            <div>
                                <span className="ov-eyebrow">Perhatian</span>
                                <h3 className="ov-card-title">Alasan Cancel Teratas</h3>
                            </div>
                        </div>
                        <div className="ov-rank-list">
                            {cancelReasons.map((item, i) => (
                                <div key={item.key} className="ov-rank-item">
                                    <div className="ov-rank-row">
                                        <span className="ov-rank-badge">{i + 1}</span>
                                        <span className="ov-rank-label">{item.label}</span>
                                        <span className="ov-rank-count">{item.count}</span>
                                        <span className="ov-rank-pct">{pctStr(item.percentage)}</span>
                                    </div>
                                    <div className="ov-rank-track">
                                        <div className="ov-rank-fill ov-rank-fill--cancel" style={{ width: `${item.percentage}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {sortedSales.length > 0 ? (
                    <div className="ov-card">
                        <div className="ov-card-head ov-card-head--sales">
                            <div className="ov-card-title-group">
                                <span className="ov-eyebrow">Performa Sales</span>
                                <h3 className="ov-card-title">Tingkat Survey per Sales</h3>
                            </div>
                            <div className="ov-card-select-wrap">
                                <Select
                                    options={[
                                        { value: 'database', label: 'Database' },
                                        { value: 'visit', label: 'Visit' },
                                        { value: 'transaksi', label: 'Transaksi' },
                                        { value: 'hot', label: 'Hot Prospek' },
                                    ]}
                                    value={selectedMetrics}
                                    onChange={(val) => {
                                        if (val && val.length > 0) {
                                            setSelectedMetrics(val);
                                        }
                                    }}
                                    multiple
                                    placeholder="Pilih metrik..."
                                    clearable={false}
                                    maxDisplayed={2}
                                />
                            </div>
                        </div>
                        {selectedMetrics.length > 1 && (
                            <div className="ov-rank-headers">
                                <span className="ov-rank-header-label">Nama Sales</span>
                                <span className="ov-rank-header-label">Detail Performa</span>
                            </div>
                        )}
                        <div className="ov-rank-table">
                            {sortedSales.map((agent) => {
                                if (selectedMetrics.length > 1) {
                                    return (
                                        <div key={agent.salesId} className="ov-rank-table-item-split">
                                            <div className="ov-rank-sales-name-col">
                                                <span className="ov-rank-label" style={{ fontWeight: 600 }}>{agent.salesName}</span>
                                            </div>
                                            <div className="ov-rank-metrics-stack">
                                                {selectedMetrics.includes('database') && (
                                                    <div className="ov-rank-metric-group">
                                                        <div className="ov-rank-metric-meta">
                                                            <span className="ov-rank-metric-name text-database">Database</span>
                                                            <span className="ov-rank-count">{agent.prospek}/{totalLeads}</span>
                                                            <span className={`ov-rank-pct ov-rank-pct--database ${agent.databasePct === 0 ? 'ov-rank-pct--zero' : ''}`}>
                                                                {pctStr(agent.databasePct)}
                                                            </span>
                                                        </div>
                                                        <div className="ov-rank-track">
                                                            <div className="ov-rank-fill ov-rank-fill--database" style={{ width: `${agent.databasePct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedMetrics.includes('visit') && (
                                                    <div className="ov-rank-metric-group">
                                                        <div className="ov-rank-metric-meta">
                                                            <span className="ov-rank-metric-name text-survey">Visit</span>
                                                            <span className="ov-rank-count">{agent.survey}/{agent.prospek}</span>
                                                            <span className={`ov-rank-pct ov-rank-pct--survey ${agent.surveyPct === 0 ? 'ov-rank-pct--zero' : ''}`}>
                                                                {pctStr(agent.surveyPct)}
                                                            </span>
                                                        </div>
                                                        <div className="ov-rank-track">
                                                            <div className="ov-rank-fill ov-rank-fill--survey" style={{ width: `${agent.surveyPct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedMetrics.includes('transaksi') && (
                                                    <div className="ov-rank-metric-group">
                                                        <div className="ov-rank-metric-meta">
                                                            <span className="ov-rank-metric-name text-transaksi">Transaksi</span>
                                                            <span className="ov-rank-count">{agent.closing}/{agent.prospek}</span>
                                                            <span className={`ov-rank-pct ov-rank-pct--transaksi ${agent.closingPct === 0 ? 'ov-rank-pct--zero' : ''}`}>
                                                                {pctStr(agent.closingPct)}
                                                            </span>
                                                        </div>
                                                        <div className="ov-rank-track">
                                                            <div className="ov-rank-fill ov-rank-fill--transaksi" style={{ width: `${agent.closingPct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedMetrics.includes('hot') && (
                                                    <div className="ov-rank-metric-group">
                                                        <div className="ov-rank-metric-meta">
                                                            <span className="ov-rank-metric-name text-hot-metric">Hot Prospek</span>
                                                            <span className="ov-rank-count">{agent.hot}/{agent.prospek}</span>
                                                            <span className={`ov-rank-pct ov-rank-pct--hot ${agent.hotPct === 0 ? 'ov-rank-pct--zero' : ''}`}>
                                                                {pctStr(agent.hotPct)}
                                                            </span>
                                                        </div>
                                                        <div className="ov-rank-track">
                                                            <div className="ov-rank-fill ov-rank-fill--hot" style={{ width: `${agent.hotPct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }

                                const singleMetric = selectedMetrics[0] || 'visit';
                                let countLabel = '';
                                let pctValue = 0;
                                let fillClass = 'ov-rank-fill--survey';

                                if (singleMetric === 'database') {
                                    countLabel = `${agent.prospek}/${totalLeads}`;
                                    pctValue = agent.databasePct;
                                    fillClass = 'ov-rank-fill--database';
                                } else if (singleMetric === 'visit') {
                                    countLabel = `${agent.survey}/${agent.prospek}`;
                                    pctValue = agent.surveyPct;
                                    fillClass = 'ov-rank-fill--survey';
                                } else if (singleMetric === 'transaksi') {
                                    countLabel = `${agent.closing}/${agent.prospek}`;
                                    pctValue = agent.closingPct;
                                    fillClass = 'ov-rank-fill--transaksi';
                                } else if (singleMetric === 'hot') {
                                    countLabel = `${agent.hot}/${agent.prospek}`;
                                    pctValue = agent.hotPct;
                                    fillClass = 'ov-rank-fill--hot';
                                }

                                return (
                                    <div key={agent.salesId} className="ov-rank-table-item">
                                        <div className="ov-rank-row" style={{ padding: 0, border: 'none' }}>
                                            <span className="ov-rank-label">{agent.salesName}</span>
                                            <span className="ov-rank-count">{countLabel}</span>
                                            <span className={`ov-rank-pct${pctValue === 0 ? ' ov-rank-pct--zero' : ''}`}>
                                                {pctStr(pctValue)}
                                            </span>
                                        </div>
                                        <div className="ov-rank-track">
                                            <div
                                                className={`ov-rank-fill ${fillClass}`}
                                                style={{ width: `${pctValue}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>

            {/* 4 — Conversion Funnel */}
            <div className="ov-card">
                <div className="ov-card-head">
                    <div>
                        <span className="ov-eyebrow">Funnel Konversi</span>
                        <h3 className="ov-card-title">Lead to Lunas</h3>
                    </div>
                </div>
                <div className="ov-funnel">
                    {funnelSteps.map((step, i) => (
                        <div key={step.key} className="ov-funnel-item">
                            <div className="ov-funnel-step">
                                <span className="ov-funnel-count">{fmt(step.count)}</span>
                                <span className="ov-funnel-label">{step.label}</span>
                                <span className="ov-funnel-pct">{step.pct.toFixed(1)}%</span>
                            </div>
                            {i < funnelSteps.length - 1 ? (
                                <div className="ov-funnel-arrow">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
