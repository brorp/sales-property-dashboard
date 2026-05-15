import { useEffect, useMemo, useState } from 'react';
import { formatCount, getPillButtonStyle, getTeamDisplayLabel } from './utils';
import './DashboardSections.css';

function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function MetricCard({ label, value, accent = 'var(--text-primary)', helper, displayValue = null }) {
    return (
        <div className="tpc-metric-card">
            <span className="tpc-metric-label">{label}</span>
            <strong className="tpc-metric-value" style={{ color: accent }}>{displayValue ?? formatCount(value)}</strong>
            {helper ? <span className="tpc-metric-helper">{helper}</span> : null}
        </div>
    );
}

function RateCard({ label, value, helper, accent = 'var(--primary)' }) {
    return (
        <div className="tpc-rate-card">
            <span className="tpc-metric-label">{label}</span>
            <strong className="tpc-rate-value" style={{ color: accent }}>{formatPercent(value)}</strong>
            <span className="tpc-metric-helper">{helper}</span>
        </div>
    );
}

function SalesCard({ sales }) {
    return (
        <div className="tpc-sales-card">
            <div className="tpc-sales-card-head">
                <span className="tpc-sales-card-name">{sales.salesName}</span>
                <span className="tpc-sales-card-total">{formatCount(sales.prospek || 0)} leads</span>
            </div>
            <div className="tpc-sales-card-stats">
                {[
                    ['Hot | Val', `${formatCount(sales.hot || 0)} | ${formatCount(sales.hotValidated || 0)}`, '#f59e0b'],
                    ['Mau Survey', formatCount(sales.mauSurvey || 0), 'var(--primary)'],
                    ['Survey', formatCount(sales.survey || 0), 'var(--green)'],
                    ['Full Book', formatCount(sales.fullBook || 0), 'var(--purple)'],
                ].map(([label, val, color]) => (
                    <div key={label} className="tpc-sales-stat">
                        <span className="tpc-sales-stat-label">{label}</span>
                        <strong className="tpc-sales-stat-value" style={{ color }}>{val}</strong>
                    </div>
                ))}
            </div>
            <div className="tpc-sales-card-rates">
                {[
                    ['Prospect', sales.prospectRate || 0],
                    ['Survey', sales.surveyRate || 0],
                    ['Closing', sales.closingRate || 0],
                ].map(([label, val]) => (
                    <div key={label} className="tpc-sales-rate-item">
                        <span className="tpc-sales-rate-label">{label}</span>
                        <span className="tpc-sales-rate-value">{formatPercent(val)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SalesCardGrid({ sales, maxCols = 5 }) {
    const cols = Math.min(sales.length, maxCols);
    return (
        <div className="tpc-sales-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {sales.map((s) => <SalesCard key={s.salesId} sales={s} />)}
        </div>
    );
}

function SupervisorGroup({ team }) {
    const sales = team.sales || [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="tpc-sup-divider">
                <span className="tpc-sup-divider-label">{getTeamDisplayLabel(team)}</span>
                <span className="tpc-sup-divider-count">{formatCount(team.prospek || 0)} leads</span>
            </div>
            {sales.length > 0 ? <SalesCardGrid sales={sales} /> : (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 0' }}>Belum ada sales.</span>
            )}
        </div>
    );
}

function buildScopeMetrics(scope, fallbackData) {
    if (scope) {
        return { totalLeads: scope.prospek || 0, totalSurvey: scope.survey || 0, totalMauSurvey: scope.mauSurvey || 0, totalHot: scope.hot || 0, totalHotValidated: scope.hotValidated || 0, totalFullBook: scope.fullBook || 0, prospectRate: scope.prospectRate || 0, surveyRate: scope.surveyRate || 0, closingRate: scope.closingRate || 0, sales: scope.sales || [] };
    }
    const validTeams = (fallbackData.teams || []).filter((t) => t.teamId !== 'unassigned_sup' && t.teamName !== 'Unassigned Supervisor');
    return { totalLeads: fallbackData.totalLeads || fallbackData.totalProspek || 0, totalSurvey: fallbackData.totalSurvey || 0, totalMauSurvey: fallbackData.totalMauSurvey || 0, totalHot: fallbackData.totalHot || 0, totalHotValidated: fallbackData.totalHotValidated || 0, totalFullBook: fallbackData.totalFullBook || 0, prospectRate: fallbackData.prospectRate || 0, surveyRate: fallbackData.surveyRate || 0, closingRate: fallbackData.closingRate || 0, sales: [], teams: validTeams };
}

function PerformancePanel({ metrics, showSalesList, maxSalesCols = 5, compact = false }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <MetricCard label="HOT | Validated" value={metrics.totalHot} displayValue={`${formatCount(metrics.totalHot)} | ${formatCount(metrics.totalHotValidated)}`} accent="#f59e0b" helper="HOT | HOT yang sudah divalidasi supervisor." />
                <MetricCard label="Mau Survey" value={metrics.totalMauSurvey} accent="var(--primary)" helper="Lead yang masih di tahap mau survey." />
                <MetricCard label="Sudah Survey" value={metrics.totalSurvey} accent="var(--green)" helper="Lead yang appointment-nya sudah survey." />
                <MetricCard label="Full Book" value={metrics.totalFullBook} accent="var(--purple)" helper="Lead yang sudah masuk status Full Book." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <RateCard label="Prospect Rate" value={metrics.prospectRate} helper={`(Hot + Mau Survey) : Total = ${formatCount(metrics.totalHot + metrics.totalMauSurvey)} : ${formatCount(metrics.totalLeads)}`} />
                <RateCard label="Survey Rate" value={metrics.surveyRate} helper={`Sudah Survey : Total = ${formatCount(metrics.totalSurvey)} : ${formatCount(metrics.totalLeads)}`} accent="var(--green)" />
                <RateCard label="Closing Rate" value={metrics.closingRate} helper={`Full Book : Total = ${formatCount(metrics.totalFullBook)} : ${formatCount(metrics.totalLeads)}`} accent="var(--purple)" />
            </div>

            {/* Semua: sales dikelompokkan per supervisor */}
            {showSalesList && metrics.teams && metrics.teams.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '4px' }}>
                    {metrics.teams.map((team) => <SupervisorGroup key={team.teamId} team={team} />)}
                </div>
            ) : null}

            {/* Spesifik supervisor: flat sales cards */}
            {showSalesList && metrics.sales && metrics.sales.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                    <span className="tpc-section-label">Breakdown per Sales</span>
                    <SalesCardGrid sales={metrics.sales} maxCols={maxSalesCols} />
                </div>
            ) : null}
        </div>
    );
}

export default function TeamPerformanceSection({
    data, sourceBreakdown = [],
    allowTeamFiltering = true, autoShowScopedDetails = false,
    selectedTeam = 'all',
}) {
    const [isCompare, setIsCompare] = useState(false);
    const [selectedSourceFilter, setSelectedSourceFilter] = useState('all');
    const [selectedTeam1, setSelectedTeam1] = useState('');
    const [selectedTeam2, setSelectedTeam2] = useState('');

    const sourceOptions = useMemo(() => {
        const def = { key: 'all', label: 'Semua Source', count: data?.totalLeads || data?.totalProspek || 0 };
        const sbItems = (Array.isArray(data?.sourceBreakdown) ? data.sourceBreakdown : []).length > 0
            ? data.sourceBreakdown
            : (Array.isArray(sourceBreakdown) ? sourceBreakdown : []);
        if (Array.isArray(data?.sourceOptions) && data.sourceOptions.length > 1) {
            return data.sourceOptions.some((o) => o.key === 'all') ? data.sourceOptions : [def, ...data.sourceOptions];
        }
        return sbItems.length > 0 ? [def, ...sbItems.map((item) => ({ key: `source:${item.source}`, label: item.source, count: item.count }))] : [def];
    }, [data, sourceBreakdown]);

    const activeData = useMemo(() => {
        if (!data || selectedSourceFilter === 'all') return data;
        return data.sourceScopes?.[selectedSourceFilter] || data;
    }, [data, selectedSourceFilter]);

    const teams = activeData?.teams || [];

    useEffect(() => {
        if (selectedSourceFilter !== 'all' && !sourceOptions.some((o) => o.key === selectedSourceFilter)) {
            setSelectedSourceFilter('all');
        }
    }, [selectedSourceFilter, sourceOptions]);

    useEffect(() => {
        if (teams.length === 0) return;
        if (!teams.some((t) => t.teamId === selectedTeam1)) setSelectedTeam1(teams[0]?.teamId || '');
        if (!teams.some((t) => t.teamId === selectedTeam2)) setSelectedTeam2(teams[1]?.teamId || teams[0]?.teamId || '');
    }, [teams, selectedTeam1, selectedTeam2]);

    if (!data) return null;

    const effectiveCompare = allowTeamFiltering && isCompare;
    const selectedTeamData = allowTeamFiltering
        ? teams.find((t) => t.teamId === selectedTeam) || null
        : teams.length === 1 ? teams[0] : null;
    const compareTeam1Data = teams.find((t) => t.teamId === selectedTeam1) || teams[0] || null;
    const compareTeam2Data = teams.find((t) => t.teamId === selectedTeam2) || teams[1] || teams[0] || null;
    const summaryMetrics = buildScopeMetrics(!effectiveCompare ? selectedTeamData : null, activeData);
    const summary = `${formatCount(summaryMetrics.totalSurvey)} survey • ${formatCount(summaryMetrics.totalHot)} hot • ${formatCount(summaryMetrics.totalFullBook)} full book`;

    const renderTeamPills = (value, onChange, prefix = 'single') => (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', scrollbarWidth: 'none' }}>
            {!isCompare ? <button key={`${prefix}-all`} type="button" onClick={() => onChange('all')} style={getPillButtonStyle(value === 'all')}>Semua</button> : null}
            {teams.map((team) => (
                <button key={`${prefix}-${team.teamId}`} type="button" onClick={() => onChange(team.teamId)} style={getPillButtonStyle(value === team.teamId)}>
                    {getTeamDisplayLabel(team)}
                </button>
            ))}
        </div>
    );

    return (
        <div className="ds-card">
            <div className="ds-card-head">
                <div>
                    <h2 className="ds-card-title">Team Prospect & Performance</h2>
                    <span className="ds-card-summary">{summary}</span>
                </div>
                {allowTeamFiltering ? (
                    <button type="button" className="tpc-compare-btn" onClick={() => setIsCompare((v) => !v)} style={getPillButtonStyle(isCompare)}>
                        {isCompare ? 'Tutup Compare' : 'Compare View'}
                    </button>
                ) : null}
            </div>

            <div className="ds-tab-body">
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', scrollbarWidth: 'none', flexWrap: 'nowrap' }}>
                    {sourceOptions.map((opt) => (
                        <button key={opt.key} type="button" onClick={() => setSelectedSourceFilter(opt.key)} style={getPillButtonStyle(selectedSourceFilter === opt.key)}>
                            {opt.label}{opt.count !== undefined ? ` (${formatCount(opt.count)})` : ''}
                        </button>
                    ))}
                </div>

                {effectiveCompare ? (
                    <div className="tpc-compare-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '20px' }}>
                            {renderTeamPills(selectedTeam1, setSelectedTeam1, 'c1')}
                            <PerformancePanel metrics={buildScopeMetrics(compareTeam1Data, activeData)} showSalesList={Boolean(compareTeam1Data)} maxSalesCols={2} compact />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '1px solid var(--border-color)' }}>
                            {renderTeamPills(selectedTeam2, setSelectedTeam2, 'c2')}
                            <PerformancePanel metrics={buildScopeMetrics(compareTeam2Data, activeData)} showSalesList={Boolean(compareTeam2Data)} maxSalesCols={2} compact />
                        </div>
                    </div>
                ) : (
                    <PerformancePanel
                        metrics={summaryMetrics}
                        showSalesList={allowTeamFiltering || (autoShowScopedDetails && Boolean(selectedTeamData))}
                    />
                )}
            </div>
        </div>
    );
}
