import { useMemo } from 'react';
import { formatCount } from './utils';
import './DashboardSections.css';

function fmt(n) { return formatCount(n); }
function pctStr(n) { return `${Number(n || 0).toFixed(1)}%`; }

function getTeamDisplayName(team) {
    if (team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor') return 'Unassigned';
    return team.teamName;
}

export default function OverviewSection({
    surveyRatio,
    statusPie,
    transactionRecap,
    resultRecap,
}) {
    const totalLeads = surveyRatio?.totalLeads || 0;
    const surveyedLeads = surveyRatio?.surveyedLeads || 0;

    const hotItem = statusPie?.items?.find((i) => i.key === 'hot');
    const hotCount = hotItem?.count || 0;

    const totalReserve = transactionRecap?.totalReserve || 0;
    const totalFullBook = transactionRecap?.totalFullBook || 0;
    const totalAkad = transactionRecap?.totalAkad || 0;
    const activePipeline = totalReserve + totalFullBook;

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

    return (
        <div className="ov-wrap">
            {/* 1 — Team Snapshot */}
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

            {/* 2 — Concern Area */}
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

            {/* 3 — Conversion Funnel */}
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
