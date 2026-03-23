import Accordion from '../../components/Accordion';
import './DashboardSections.css';
import { useEffect, useState } from 'react';

const PIE_COLORS = [
    '#7c4dff',
    '#ff9800',
    '#26a69a',
    '#ef5350',
    '#42a5f5',
    '#ab47bc',
    '#9ccc65',
    '#ffa726',
];

const DEFAULT_TRANSACTION_STATUS_OPTIONS = [
    { key: 'all', label: 'Semua' },
    { key: 'akad', label: 'Akad' },
    { key: 'full_book', label: 'Full Book' },
    { key: 'on_process', label: 'On Process' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'cancel', label: 'Cancel' },
];

const PIC_AGENT_STATUS_OPTIONS = [
    { key: 'akad', label: 'Akad' },
    { key: 'full_book', label: 'Full Book' },
    { key: 'on_process', label: 'On Process' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'cancel', label: 'Cancel' },
];

function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
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

function buildConicGradient(items) {
    const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
    if (total <= 0) {
        return 'rgba(255,255,255,0.06)';
    }

    let cursor = 0;
    const segments = items
        .filter((item) => item.count > 0)
        .map((item) => {
            const start = (cursor / total) * 360;
            cursor += item.count;
            const end = (cursor / total) * 360;
            return `${item.color} ${start}deg ${end}deg`;
        });

    return `conic-gradient(${segments.join(', ')})`;
}

function PieChartCard({ title, subtitle, total, items, emptyLabel = 'Belum ada data' }) {
    const chartItems = items.filter((item) => item.count > 0);

    return (
        <div
            style={{
                padding: '18px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h4>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</span>
            </div>

            {chartItems.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 220px) 1fr',
                        gap: '20px',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div
                            style={{
                                width: '180px',
                                height: '180px',
                                borderRadius: '50%',
                                background: buildConicGradient(chartItems),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                            }}
                        >
                            <div
                                style={{
                                    width: '96px',
                                    height: '96px',
                                    borderRadius: '50%',
                                    background: 'var(--bg-app)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    padding: '8px',
                                }}
                            >
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
                                <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>{formatCount(total)}</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {chartItems.map((item) => {
                            const percentage = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                            return (
                                <div
                                    key={item.label}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto 1fr auto auto',
                                        gap: '10px',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        background: 'var(--bg-input)',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '999px',
                                            background: item.color,
                                            display: 'inline-block',
                                        }}
                                    />
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                                    <strong style={{ color: 'var(--text-primary)' }}>{formatCount(item.count)}</strong>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{percentage}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TransactionRecapSection({
    data,
    onUnitTypeChange,
    dateFilterControl = null,
    allowTeamFiltering = true,
    showCrossTeamInsights = true,
    scopeLabel = 'Semua Supervisor',
    viewerRole = '',
    viewerId = '',
    viewerName = '',
}) {
    const teams = data?.teams || [];
    const [isCompare, setIsCompare] = useState(false);
    const [unitType, setUnitType] = useState('');
    const [transactionChartStatus, setTransactionChartStatus] = useState('all');
    const [picAgentStatus, setPicAgentStatus] = useState('akad');
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

    if (!data) return null;

    const summary = `${data.totalOngoing || 0} ongoing • ${data.totalClosing || 0} closing • ${data.teams?.length || 0} teams`;
    const transactionStatusOptions = data.chartStatusOptions || DEFAULT_TRANSACTION_STATUS_OPTIONS;
    const selectedChartStatusMeta =
        transactionStatusOptions.find((item) => item.key === transactionChartStatus) ||
        transactionStatusOptions[0] ||
        DEFAULT_TRANSACTION_STATUS_OPTIONS[0];
    const selectedPicAgentStatusMeta =
        PIC_AGENT_STATUS_OPTIONS.find((item) => item.key === picAgentStatus) ||
        PIC_AGENT_STATUS_OPTIONS[0];
    const effectiveCompare = allowTeamFiltering && isCompare;
    const isScopedSupervisor = !allowTeamFiltering && viewerRole === 'supervisor';
    const isScopedSales = !allowTeamFiltering && viewerRole === 'sales';
    const selectedTeamData = allowTeamFiltering
        ? teams.find((team) => team.teamId === selectedTeamFilter) || null
        : teams.length === 1
            ? teams[0]
            : null;
    const compareTeam1Data = teams.find((team) => team.teamId === selectedTeam1) || teams[0] || null;
    const compareTeam2Data = teams.find((team) => team.teamId === selectedTeam2) || teams[1] || teams[0] || null;
    const selectedSalesData = isScopedSales
        ? selectedTeamData?.sales?.find((sales) => sales.salesId === viewerId) || selectedTeamData?.sales?.[0] || null
        : null;
    const summaryScope = !effectiveCompare && selectedTeamData
        ? {
            totalAkad: selectedTeamData.akad || 0,
            totalReserve: selectedTeamData.reserve || 0,
            totalOnProcess: selectedTeamData.onProcess || 0,
            totalFullBook: selectedTeamData.fullBook || 0,
            totalCancel: selectedTeamData.cancel || 0,
        }
        : {
            totalAkad: data.totalAkad || 0,
            totalReserve: data.totalReserve || 0,
            totalOnProcess: data.totalOnProcess || 0,
            totalFullBook: data.totalFullBook || 0,
            totalCancel: data.totalCancel || 0,
        };
    const picAgentComparison = data.picAgentComparison?.[picAgentStatus] || { agent: 0, others: 0, total: 0 };
    const sourceLeadItems = (data.transactionSourceBreakdown?.[transactionChartStatus] || []).map((item, index) => ({
        label: item.label,
        count: item.count,
        color: PIE_COLORS[index % PIE_COLORS.length],
    }));
    const unitTypeItems = (data.unitTypeBreakdown?.[transactionChartStatus] || []).map((item, index) => ({
        label: item.label,
        count: item.count,
        color: PIE_COLORS[index % PIE_COLORS.length],
    }));
    const picAgentTotal = Number(picAgentComparison.total || 0);
    const picAgentPercentage = picAgentTotal > 0 ? Math.round(((picAgentComparison.agent || 0) / picAgentTotal) * 10000) / 100 : 0;
    const allSupervisorPercentage = picAgentTotal > 0 ? Math.round(((picAgentComparison.others || 0) / picAgentTotal) * 10000) / 100 : 0;

    const handleUnitTypeChange = (event) => {
        setUnitType(event.target.value);
        if (onUnitTypeChange) {
            onUnitTypeChange(event.target.value);
        }
    };

    const renderSalesScopeCard = (sales) => {
        if (!sales) {
            return null;
        }

        return (
            <div className="section-stat-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem' }}>{viewerName || sales.salesName || scopeLabel}</h3>
                </div>

                <div>
                    <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Akad</span>
                        <strong style={{ fontSize: '2rem', color: 'var(--green)', marginTop: '4px' }}>{sales.akad || 0}</strong>
                    </div>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On-Going & Cancel</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reserve</span>
                            <strong style={{ fontSize: '1.4rem', marginTop: '4px' }}>{sales.reserve || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>On Process</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--primary)', marginTop: '4px' }}>{sales.onProcess || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Full Book</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--purple)', marginTop: '4px' }}>{sales.fullBook || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cancel</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>{sales.cancel || 0}</strong>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderTeamCard = (team) => {
        if (!team) {
            return null;
        }

        return (
            <div className="section-stat-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem' }}>{getTeamDisplayLabel(team)}</h3>
                </div>

                <div>
                    <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Akad</span>
                        <strong style={{ fontSize: '2rem', color: 'var(--green)', marginTop: '4px' }}>{team.akad || 0}</strong>
                    </div>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On-Going & Cancel</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reserve</span>
                            <strong style={{ fontSize: '1.4rem', marginTop: '4px' }}>{team.reserve || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>On Process</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--primary)', marginTop: '4px' }}>{team.onProcess || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Full Book</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--purple)', marginTop: '4px' }}>{team.fullBook || 0}</strong>
                        </div>
                        <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cancel</span>
                            <strong style={{ fontSize: '1.4rem', color: 'var(--danger)', marginTop: '4px' }}>{team.cancel || 0}</strong>
                        </div>
                    </div>
                </div>

                {team.sales && team.sales.length > 0 ? (
                    <>
                        <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                        <div>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sales Performance</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {team.sales.map((sales, index) => (
                                    <div key={sales.salesId || index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{sales.salesName}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prospek: {sales.prospek}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Akad</span>
                                                <strong style={{ color: 'var(--green)' }}>{sales.akad || 0}</strong>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Rsrv</span>
                                                <strong style={{ color: 'var(--text-primary)' }}>{sales.reserve || 0}</strong>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Prcs</span>
                                                <strong style={{ color: 'var(--primary)' }}>{sales.onProcess || 0}</strong>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>FB</span>
                                                <strong style={{ color: 'var(--purple)' }}>{sales.fullBook || 0}</strong>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Cncl</span>
                                                <strong style={{ color: 'var(--danger)' }}>{sales.cancel || 0}</strong>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        );
    };

    const renderTeamFilterPills = (value, onChange) => (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {teams.map((team) => (
                <button
                    key={team.teamId}
                    type="button"
                    onClick={() => onChange(team.teamId)}
                    style={getPillButtonStyle(value === team.teamId)}
                >
                    {getTeamDisplayLabel(team)}
                </button>
            ))}
        </div>
    );

    const detailContent = effectiveCompare
        ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pilih Supervisor / PIC 1</span>
                        {renderTeamFilterPills(selectedTeam1, setSelectedTeam1)}
                    </div>
                    {renderTeamCard(compareTeam1Data)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pilih Supervisor / PIC 2</span>
                        {renderTeamFilterPills(selectedTeam2, setSelectedTeam2)}
                    </div>
                    {renderTeamCard(compareTeam2Data)}
                </div>
            </div>
        )
        : selectedTeamData
            ? renderTeamCard(selectedTeamData)
            : null;

    const scopedPrimaryContent = isScopedSales
        ? renderSalesScopeCard(selectedSalesData)
        : isScopedSupervisor
            ? renderTeamCard(selectedTeamData)
            : null;

    const activeScopeLabel = isScopedSales
        ? viewerName || selectedSalesData?.salesName || scopeLabel
        : selectedTeamData
            ? getTeamDisplayLabel(selectedTeamData)
            : scopeLabel;

    return (
        <Accordion title="Transaction Recap" summary={summary} defaultExpanded={false}>
            <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Leads Total</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Scope aktif: <strong style={{ color: 'var(--text-primary)' }}>{effectiveCompare ? 'Compare View' : activeScopeLabel}</strong>
                        </span>
                    </div>
                    {allowTeamFiltering ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setIsCompare((prev) => !prev)}
                                style={getPillButtonStyle(isCompare)}
                            >
                                {isCompare ? 'Tutup Compare' : 'Compare View'}
                            </button>
                        </div>
                    ) : null}
                </div>

                {dateFilterControl}

                {allowTeamFiltering && !effectiveCompare ? (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                        <button
                            type="button"
                            onClick={() => setSelectedTeamFilter('all')}
                            style={getPillButtonStyle(selectedTeamFilter === 'all')}
                        >
                            Semua
                        </button>
                        {teams.map((team) => (
                            <button
                                key={team.teamId}
                                type="button"
                                onClick={() => setSelectedTeamFilter(team.teamId)}
                                style={getPillButtonStyle(selectedTeamFilter === team.teamId)}
                            >
                                {getTeamDisplayLabel(team)}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>Tipe Unit:</label>
                        <select
                            value={unitType}
                            onChange={handleUnitTypeChange}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: '500'
                            }}
                        >
                            <option value="">Semua Tipe</option>
                            <option value="Studio">Studio</option>
                            <option value="1BR">1 BR</option>
                            <option value="2BR">2 BR</option>
                            <option value="3BR">3 BR</option>
                            <option value="Townhouse">Townhouse</option>
                            <option value="Penthouse">Penthouse</option>
                        </select>
                    </div>
                </div>

                {allowTeamFiltering ? (
                    <>
                        <div>
                            <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Total Akad</span>
                                <strong style={{ fontSize: '2rem', color: 'var(--green)', marginTop: '4px' }}>{summaryScope.totalAkad || 0}</strong>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Full Book</span>
                                <strong style={{ fontSize: '1.4rem', color: 'var(--purple)', marginTop: '4px' }}>{summaryScope.totalFullBook || 0}</strong>
                            </div>
                            <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total On Process</span>
                                <strong style={{ fontSize: '1.4rem', color: 'var(--primary)', marginTop: '4px' }}>{summaryScope.totalOnProcess || 0}</strong>
                            </div>
                            <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Reserve</span>
                                <strong style={{ fontSize: '1.4rem', marginTop: '4px' }}>{summaryScope.totalReserve || 0}</strong>
                            </div>
                            
                            <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Cancel</span>
                                <strong style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>{summaryScope.totalCancel || 0}</strong>
                            </div>
                        </div>

                        {detailContent}
                    </>
                ) : (
                    scopedPrimaryContent
                )}
            </div>

            {showCrossTeamInsights ? (
                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>➤ Divisi Closing PIC Agent vs All Supervisor Data</h3>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                {PIC_AGENT_STATUS_OPTIONS.map((status) => (
                                    <button
                                        key={status.key}
                                        type="button"
                                        onClick={() => setPicAgentStatus(status.key)}
                                        style={getPillButtonStyle(picAgentStatus === status.key)}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Total data {selectedPicAgentStatusMeta?.label}: <strong style={{ color: 'var(--text-primary)' }}>{formatCount(picAgentTotal)}</strong>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <div style={{ padding: '18px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid rgba(124, 77, 255, 0.35)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PIC Agent</span>
                            <strong style={{ fontSize: '2rem', color: 'var(--primary)' }}>{formatCount(picAgentComparison.agent || 0)}</strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{picAgentPercentage}% dari total data status ini</span>
                        </div>
                        <div style={{ padding: '18px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid rgba(38, 166, 154, 0.35)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Supervisor Data</span>
                            <strong style={{ fontSize: '2rem', color: '#26a69a' }}>{formatCount(picAgentComparison.others || 0)}</strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{allSupervisorPercentage}% dari total data status ini</span>
                        </div>
                    </div>
                </div>
            ) : null}

            <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>➤ Analisa Closing per Status</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Filter status aktif: <strong style={{ color: 'var(--text-primary)' }}>{selectedChartStatusMeta?.label || 'Semua'}</strong>
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                        {transactionStatusOptions.map((status) => (
                            <button
                                key={status.key}
                                type="button"
                                onClick={() => setTransactionChartStatus(status.key)}
                                style={{
                                    cursor: 'pointer',
                                    padding: '8px 14px',
                                    borderRadius: '999px',
                                    border: transactionChartStatus === status.key ? 'none' : '1px solid var(--border-color)',
                                    background: transactionChartStatus === status.key ? 'var(--primary)' : 'var(--bg-card)',
                                    color: transactionChartStatus === status.key ? 'white' : 'var(--text-primary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {status.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                    <PieChartCard
                        title="Analisa Source Leads"
                        subtitle="Komposisi source leads dari seluruh data yang sudah masuk status transaksi terpilih."
                        total={sourceLeadItems.reduce((sum, item) => sum + item.count, 0)}
                        items={sourceLeadItems}
                        emptyLabel="Belum ada data transaksi untuk status ini."
                    />
                    <PieChartCard
                        title="Komposisi Tipe Unit"
                        subtitle="Distribusi tipe unit dari seluruh leads yang sudah masuk status transaksi terpilih."
                        total={unitTypeItems.reduce((sum, item) => sum + item.count, 0)}
                        items={unitTypeItems}
                        emptyLabel="Belum ada tipe unit pada status transaksi ini."
                    />
                </div>
            </div>
        </Accordion>
    );
}
