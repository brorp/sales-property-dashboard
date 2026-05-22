import { useMemo } from 'react';
import { formatCount } from './utils';
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
    const totalLeads = surveyRatio?.totalLeads || 0;
    const surveyedLeads = surveyRatio?.surveyedLeads || 0;
    const surveyRatioPercent = surveyRatio?.ratioPercent || 0;

    const hotItem = statusPie?.items?.find((i) => i.key === 'hot');
    const hotCount = hotItem?.count || 0;
    const hotPct = hotItem?.percentage || 0;

    const totalReserve = transactionRecap?.totalReserve || 0;
    const totalOnProcess = transactionRecap?.totalOnProcess || 0;
    const totalFullBook = transactionRecap?.totalFullBook || 0;
    const totalAkad = transactionRecap?.totalAkad || 0;
    const totalCancel = transactionRecap?.totalCancel || 0;
    const activePipeline = totalReserve + totalOnProcess + totalFullBook;
    const totalClosing = totalFullBook + totalAkad;
    const closingPct = totalLeads > 0 ? (totalClosing / totalLeads) * 100 : 0;

    const todayLeads = useMemo(() => {
        if (!dailySalesReport?.leadsBySales) return 0;
        return dailySalesReport.leadsBySales.reduce((acc, s) => acc + (s.total || 0), 0);
    }, [dailySalesReport]);

    const walkIn = dailySalesReport?.walkIn || 0;
    const callIn = dailySalesReport?.callIn || 0;
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
        { key: 'akad', label: 'Akad', count: totalAkad, pct: totalLeads > 0 ? (totalAkad / totalLeads) * 100 : 0 },
    ];

    const teams = useMemo(() => {
        if (!transactionRecap?.teams) return [];
        return transactionRecap.teams.filter((t) => (t.prospek || 0) > 0);
    }, [transactionRecap]);

    const cancelReasons = resultRecap?.cancelReasons?.items?.slice(0, 4) || [];

    const agentRates = useMemo(() => {
        if (!perAgentSurveyRatio?.length) return [];
        return [...perAgentSurveyRatio].sort((a, b) => b.ratioPercent - a.ratioPercent);
    }, [perAgentSurveyRatio]);

    const maxAgentRate = useMemo(
        () => Math.max(...agentRates.map((a) => a.ratioPercent), 1),
        [agentRates],
    );

    return (
        <div className="ov-wrap">

            {/* 1 — Hero KPI Strip */}
            <div className="ov-kpi-strip">
                <KpiCard label="Total Leads" value={fmt(totalLeads)} sub="Semua lead masuk" accent="blue" />
                <KpiCard label="Hot Leads" value={fmt(hotCount)} sub={`${pctStr(hotPct)} dari total`} accent="red" />
                <KpiCard label="Sudah Survey" value={fmt(surveyedLeads)} sub={`${pctStr(surveyRatioPercent)} tingkat survey`} accent="teal" />
                <KpiCard label="Pipeline Aktif" value={fmt(activePipeline)} sub="Reserve + OP + FB" accent="purple" />
                <KpiCard label="Closing" value={fmt(totalClosing)} sub={`${pctStr(closingPct)} konversi`} accent="green" />
            </div>

            {/* 2 — Conversion Funnel */}
            <div className="ov-card">
                <div className="ov-card-head">
                    <div>
                        <span className="ov-eyebrow">Funnel Konversi</span>
                        <h3 className="ov-card-title">Lead → Akad</h3>
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

            {/* 3 — Daily Pulse + Pipeline Aktif */}
            <div className="ov-two-col">
                {dailySalesReport ? (
                    <div className="ov-card">
                        <div className="ov-card-head">
                            <div>
                                <span className="ov-eyebrow">Hari Ini</span>
                                <h3 className="ov-card-title">Aktivitas Hari Ini</h3>
                                <span className="ov-card-note">Data hari ini · tidak mengikuti filter periode</span>
                            </div>
                            <span className="ov-date-badge">{dailySalesReport.dateLabel}</span>
                        </div>
                        <div className="ov-pulse-grid">
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Leads Masuk</span>
                                <span className="ov-pulse-value">{fmt(todayLeads)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Walk-in</span>
                                <span className="ov-pulse-value">{fmt(walkIn)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Call-in</span>
                                <span className="ov-pulse-value">{fmt(callIn)}</span>
                            </div>
                            <div className="ov-pulse-item">
                                <span className="ov-pulse-label">Janji Temu</span>
                                <span className="ov-pulse-value">{fmt(appointmentCount)}</span>
                            </div>
                            <div className="ov-pulse-item ov-pulse-item--accent">
                                <span className="ov-pulse-label">Total Reserve</span>
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
                    <div className="ov-pipeline-grid">
                        <PipelineCard label="Reserve" value={fmt(totalReserve)} color="var(--text-secondary)" />
                        <PipelineCard label="On Process" value={fmt(totalOnProcess)} color="#2563EB" />
                        <PipelineCard label="Full Book" value={fmt(totalFullBook)} color="#7C3AED" />
                        <PipelineCard label="Akad" value={fmt(totalAkad)} color="#16A34A" />
                    </div>
                    <div className="ov-pipeline-footer">
                        <span className="ov-pipeline-footer-label">Batal</span>
                        <span className="ov-pipeline-footer-value">{fmt(totalCancel)}</span>
                    </div>
                </div>
            </div>

            {/* 4 — Team Snapshot */}
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

            {/* 5 — Concern Area */}
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

                {agentRates.length > 0 ? (
                    <div className="ov-card">
                        <div className="ov-card-head">
                            <div>
                                <span className="ov-eyebrow">Performa Sales</span>
                                <h3 className="ov-card-title">Tingkat Survey per Sales</h3>
                            </div>
                        </div>
                        <div className="ov-rank-list">
                            {agentRates.map((agent) => (
                                <div key={agent.salesId} className="ov-rank-item">
                                    <div className="ov-rank-row">
                                        <span className="ov-rank-label">{agent.salesName}</span>
                                        <span className="ov-rank-count">{agent.surveyedLeads}/{agent.totalLeads}</span>
                                        <span className={`ov-rank-pct${agent.ratioPercent === 0 ? ' ov-rank-pct--zero' : ''}`}>
                                            {pctStr(agent.ratioPercent)}
                                        </span>
                                    </div>
                                    <div className="ov-rank-track">
                                        <div
                                            className="ov-rank-fill ov-rank-fill--survey"
                                            style={{ width: `${maxAgentRate > 0 ? (agent.ratioPercent / maxAgentRate) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>

        </div>
    );
}
