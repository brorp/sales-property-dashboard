import { useEffect, useState } from 'react';
import Accordion from '../../components/Accordion';
import './DashboardSections.css';

function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function getPillButtonStyle(active) {
    return {
        cursor: 'pointer',
        padding: '8px 14px',
        borderRadius: '999px',
        border: active ? 'none' : '1px solid var(--border-color)',
        background: active ? 'var(--primary)' : 'var(--bg-card)',
        color: active ? 'white' : 'var(--text-primary)',
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
    };
}

function getTeamDisplayLabel(team) {
    if (!team) {
        return '';
    }

    if (team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor') {
        return 'PIC Agent';
    }

    return team.teamName;
}

function MetricCard({ label, value, accent = 'var(--text-primary)', helper }) {
    return (
        <div
            style={{
                background: 'var(--bg-input)',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minHeight: '118px',
            }}
        >
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </span>
            <strong style={{ fontSize: '2rem', lineHeight: 1, color: accent }}>{formatCount(value)}</strong>
            {helper ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{helper}</span>
            ) : null}
        </div>
    );
}

function RateCard({ label, value, helper, accent = 'var(--primary)' }) {
    return (
        <div
            style={{
                background: 'var(--bg-input)',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minHeight: '112px',
            }}
        >
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </span>
            <strong style={{ fontSize: '1.8rem', lineHeight: 1, color: accent }}>{formatPercent(value)}</strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{helper}</span>
        </div>
    );
}

function SalesRow({ sales }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1.5fr) repeat(4, minmax(70px, 1fr)) repeat(3, minmax(88px, 1fr))',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    minWidth: '860px',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>{sales.salesName}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        Total Leads: {formatCount(sales.prospek || 0)}
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Hot</span>
                    <strong style={{ color: '#f59e0b' }}>{formatCount(sales.hot || 0)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Mau</span>
                    <strong style={{ color: 'var(--primary)' }}>{formatCount(sales.mauSurvey || 0)}</strong>
                </div>
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Survey</span>
                    <strong style={{ color: 'var(--green)' }}>{formatCount(sales.survey || 0)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Full Book</span>
                    <strong style={{ color: 'var(--purple)' }}>{formatCount(sales.fullBook || 0)}</strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Prospect</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatPercent(sales.prospectRate || 0)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Survey</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatPercent(sales.surveyRate || 0)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Closing</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatPercent(sales.closingRate || 0)}</strong>
                </div>
            </div>
        </div>
    );
}

function buildScopeMetrics(scope, fallbackData) {
    if (scope) {
        return {
            totalLeads: scope.prospek || 0,
            totalSurvey: scope.survey || 0,
            totalMauSurvey: scope.mauSurvey || 0,
            totalHot: scope.hot || 0,
            totalHotValidated: scope.hotValidated || 0,
            totalFullBook: scope.fullBook || 0,
            prospectRate: scope.prospectRate || 0,
            surveyRate: scope.surveyRate || 0,
            closingRate: scope.closingRate || 0,
            sales: scope.sales || [],
        };
    }

    const validTeams = (fallbackData.teams || []).filter(
        (t) => t.teamId !== 'unassigned_sup' && t.teamName !== 'Unassigned Supervisor'
    );

    return {
        totalLeads: fallbackData.totalLeads || fallbackData.totalProspek || 0,
        totalSurvey: fallbackData.totalSurvey || 0,
        totalMauSurvey: fallbackData.totalMauSurvey || 0,
        totalHot: fallbackData.totalHot || 0,
        totalHotValidated: fallbackData.totalHotValidated || 0,
        totalFullBook: fallbackData.totalFullBook || 0,
        prospectRate: fallbackData.prospectRate || 0,
        surveyRate: fallbackData.surveyRate || 0,
        closingRate: fallbackData.closingRate || 0,
        sales: [],
        teams: validTeams,
    };
}

function TeamPerformancePanel({ title, metrics, showSalesList }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                padding: '20px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{title}</h3>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Total leads di scope ini: <strong style={{ color: 'var(--text-primary)' }}>{formatCount(metrics.totalLeads)}</strong>
                    </span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <MetricCard label="Hot" value={metrics.totalHot} accent="#f59e0b" helper="Lead dengan layer 2 status Hot." />
                {metrics.totalHotValidated > 0 ? (
                    <MetricCard label="HOT | Validated" value={metrics.totalHotValidated} accent="#22c55e" helper="Lead HOT yang sudah divalidasi supervisor." />
                ) : null}
                <MetricCard label="Mau Survey" value={metrics.totalMauSurvey} accent="var(--primary)" helper="Lead yang masih di tahap mau survey." />
                <MetricCard label="Sudah Survey" value={metrics.totalSurvey} accent="var(--green)" helper="Lead yang appointment-nya sudah survey." />
                <MetricCard label="Full Book" value={metrics.totalFullBook} accent="var(--purple)" helper="Lead yang sudah masuk status Full Book." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <RateCard
                    label="Prospect Rate"
                    value={metrics.prospectRate}
                    helper={`(Hot + Mau Survey) : Total Leads = ${formatCount(metrics.totalHot + metrics.totalMauSurvey)} : ${formatCount(metrics.totalLeads)}`}
                />
                <RateCard
                    label="Survey Rate"
                    value={metrics.surveyRate}
                    helper={`Sudah Survey : Total Leads = ${formatCount(metrics.totalSurvey)} : ${formatCount(metrics.totalLeads)}`}
                    accent="var(--green)"
                />
                <RateCard
                    label="Closing Rate"
                    value={metrics.closingRate}
                    helper={`Full Book : Total Leads = ${formatCount(metrics.totalFullBook)} : ${formatCount(metrics.totalLeads)}`}
                    accent="var(--purple)"
                />
            </div>

            {showSalesList && metrics.sales && metrics.sales.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Breakdown per Sales</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {metrics.sales.map((sales) => (
                            <SalesRow key={sales.salesId} sales={sales} />
                        ))}
                    </div>
                </div>
            ) : null}

            {showSalesList && metrics.teams && metrics.teams.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '12px' }}>
                    {metrics.teams.map((team) => (
                        <div key={team.teamId} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                    Supervisor: {getTeamDisplayLabel(team)}
                                </h4>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Total Leads: <strong style={{ color: 'var(--text-primary)' }}>{formatCount(team.prospek || 0)}</strong>
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(team.sales || []).map((sales) => (
                                    <SalesRow key={sales.salesId} sales={sales} />
                                ))}
                                {(!team.sales || team.sales.length === 0) && (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Belum ada data sales.</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function TeamPerformanceSection({
    data,
    dateFilterControl = null,
    allowTeamFiltering = true,
    autoShowScopedDetails = false,
    scopeLabel = 'Semua Supervisor & PIC Agent',
}) {
    const teams = data?.teams || [];
    const [isCompare, setIsCompare] = useState(false);
    const [selectedTeamFilter, setSelectedTeamFilter] = useState('all');
    const [selectedTeam1, setSelectedTeam1] = useState('');
    const [selectedTeam2, setSelectedTeam2] = useState('');

    useEffect(() => {
        if (teams.length === 0) {
            return;
        }

        const hasTeam1 = teams.some((team) => team.teamId === selectedTeam1);
        const hasTeam2 = teams.some((team) => team.teamId === selectedTeam2);
        const firstTeamId = teams[0]?.teamId || '';
        const secondTeamId = teams[1]?.teamId || firstTeamId;

        if (!hasTeam1) {
            setSelectedTeam1(firstTeamId);
        }

        if (!hasTeam2) {
            setSelectedTeam2(secondTeamId);
        }
    }, [teams, selectedTeam1, selectedTeam2]);

    if (!data) {
        return null;
    }

    const effectiveCompare = allowTeamFiltering && isCompare;
    const selectedTeamData = allowTeamFiltering
        ? teams.find((team) => team.teamId === selectedTeamFilter) || null
        : teams.length === 1
            ? teams[0]
            : null;
    const compareTeam1Data = teams.find((team) => team.teamId === selectedTeam1) || teams[0] || null;
    const compareTeam2Data = teams.find((team) => team.teamId === selectedTeam2) || teams[1] || teams[0] || null;
    const summaryMetrics = buildScopeMetrics(!effectiveCompare ? selectedTeamData : null, data);
    const summary = `${formatCount(summaryMetrics.totalSurvey)} sudah survey • ${formatCount(summaryMetrics.totalHot)} hot • ${formatCount(summaryMetrics.totalFullBook)} full book`;

    const renderTeamPills = (value, onChange, compareKeyPrefix = 'single') => (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {!isCompare ? (
                <button
                    key={`${compareKeyPrefix}-all`}
                    type="button"
                    onClick={() => onChange('all')}
                    style={getPillButtonStyle(value === 'all')}
                >
                    Semua
                </button>
            ) : null}

            {teams.map((team) => (
                <button
                    key={`${compareKeyPrefix}-${team.teamId}`}
                    type="button"
                    onClick={() => onChange(team.teamId)}
                    style={getPillButtonStyle(value === team.teamId)}
                >
                    {getTeamDisplayLabel(team)}
                </button>
            ))}
        </div>
    );

    return (
        <Accordion title="Team Prospect & Performance" summary={summary} defaultExpanded={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Leads Health & Conversion</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            Fokus pada Sudah Survey, Mau Survey, Hot, dan Full Book.
                        </span>
                    </div>

                    {allowTeamFiltering ? (
                        <button
                            type="button"
                            onClick={() => setIsCompare((value) => !value)}
                            style={getPillButtonStyle(isCompare)}
                        >
                            {isCompare ? 'Tutup Compare' : 'Compare View'}
                        </button>
                    ) : null}
                </div>

                {dateFilterControl}

                {allowTeamFiltering && !effectiveCompare ? (
                    <>
                        {renderTeamPills(selectedTeamFilter, setSelectedTeamFilter)}
                        <TeamPerformancePanel
                            title={selectedTeamData ? getTeamDisplayLabel(selectedTeamData) : scopeLabel}
                            metrics={buildScopeMetrics(selectedTeamData, data)}
                            showSalesList={true}
                        />
                    </>
                ) : !allowTeamFiltering ? (
                    <TeamPerformancePanel
                        title={scopeLabel}
                        metrics={buildScopeMetrics(selectedTeamData, data)}
                        showSalesList={autoShowScopedDetails && Boolean(selectedTeamData)}
                    />
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {renderTeamPills(selectedTeam1, setSelectedTeam1, 'compare-1')}
                            <TeamPerformancePanel
                                title={getTeamDisplayLabel(compareTeam1Data) || 'Team 1'}
                                metrics={buildScopeMetrics(compareTeam1Data, data)}
                                showSalesList={Boolean(compareTeam1Data)}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {renderTeamPills(selectedTeam2, setSelectedTeam2, 'compare-2')}
                            <TeamPerformancePanel
                                title={getTeamDisplayLabel(compareTeam2Data) || 'Team 2'}
                                metrics={buildScopeMetrics(compareTeam2Data, data)}
                                showSalesList={Boolean(compareTeam2Data)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </Accordion>
    );
}
