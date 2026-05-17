import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCount, getPillButtonStyle, getTeamDisplayLabel } from './utils';
import PieChartCard from '../../components/PieChartCard';
import './DashboardSections.css';

const PIE_COLORS = ['#7c4dff', '#ff9800', '#26a69a', '#ef5350', '#42a5f5', '#ab47bc', '#9ccc65', '#ffa726'];

function TransactionSalesCard({ sales }) {
    return (
        <div className="tpc-sales-card">
            <div className="tpc-sales-card-head">
                <span className="tpc-sales-card-name">{sales.salesName}</span>
                <span className="tpc-sales-card-total">{formatCount(sales.prospek || 0)} leads</span>
            </div>
            <div className="tpc-sales-stat" style={{ borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                <span className="tpc-sales-stat-label">Akad</span>
                <strong className="tpc-sales-stat-value" style={{ color: 'var(--green)', fontSize: '1.2rem' }}>{formatCount(sales.akad || 0)}</strong>
            </div>
            <div className="tpc-sales-card-stats">
                {[
                    ['Reserve', sales.reserve || 0, 'var(--text-primary)'],
                    ['On Process', sales.onProcess || 0, 'var(--primary)'],
                    ['Full Book', sales.fullBook || 0, 'var(--purple)'],
                    ['Cancel', sales.cancel || 0, 'var(--danger)'],
                ].map(([label, val, color]) => (
                    <div key={label} className="tpc-sales-stat">
                        <span className="tpc-sales-stat-label">{label}</span>
                        <strong className="tpc-sales-stat-value" style={{ color }}>{formatCount(val)}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TransactionSalesGrid({ sales, maxCols = 5 }) {
    const cols = Math.min(sales.length, maxCols);
    return (
        <div className="tpc-sales-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {sales.map((s, i) => <TransactionSalesCard key={s.salesId || i} sales={s} />)}
        </div>
    );
}

const PIC_AGENT_STATUS_OPTIONS = [
    { key: 'akad', label: 'Akad' },
    { key: 'full_book', label: 'Full Book' },
    { key: 'on_process', label: 'On Process' },
    { key: 'reserve', label: 'Reserve' },
    { key: 'cancel', label: 'Cancel' },
];


export default function TransactionRecapSection({
    data, onUnitTypeChange,
    allowTeamFiltering = true, showCrossTeamInsights = true,
    scopeLabel = 'Semua Supervisor', viewerRole = '', viewerId = '', viewerName = '',
    selectedTeam = 'all',
    picAgentStatus = 'akad',
    transactionChartStatus = 'all',
    unitType = '',
}) {
    const router = useRouter();
    const teams = data?.teams || [];
    const [isCompare, setIsCompare] = useState(false);
    const [selectedTeam1, setSelectedTeam1] = useState('');
    const [selectedTeam2, setSelectedTeam2] = useState('');

    useEffect(() => {
        if (teams.length === 0) return;
        if (!teams.some((t) => t.teamId === selectedTeam1)) setSelectedTeam1(teams[0]?.teamId || '');
        if (!teams.some((t) => t.teamId === selectedTeam2)) setSelectedTeam2(teams[1]?.teamId || teams[0]?.teamId || '');
    }, [teams, selectedTeam1, selectedTeam2]);

    if (!data) return null;

    const effectiveCompare = allowTeamFiltering && isCompare;
    const isScopedSupervisor = !allowTeamFiltering && viewerRole === 'supervisor';
    const isScopedSales = !allowTeamFiltering && viewerRole === 'sales';
    const selectedTeamData = allowTeamFiltering
        ? teams.find((t) => t.teamId === selectedTeam) || null
        : teams.length === 1 ? teams[0] : null;
    const compareTeam1Data = teams.find((t) => t.teamId === selectedTeam1) || teams[0] || null;
    const compareTeam2Data = teams.find((t) => t.teamId === selectedTeam2) || teams[1] || teams[0] || null;
    const selectedSalesData = isScopedSales
        ? selectedTeamData?.sales?.find((s) => s.salesId === viewerId) || selectedTeamData?.sales?.[0] || null
        : null;
    const summaryScope = !effectiveCompare && selectedTeamData
        ? { totalAkad: selectedTeamData.akad || 0, totalReserve: selectedTeamData.reserve || 0, totalOnProcess: selectedTeamData.onProcess || 0, totalFullBook: selectedTeamData.fullBook || 0, totalCancel: selectedTeamData.cancel || 0 }
        : { totalAkad: data.totalAkad || 0, totalReserve: data.totalReserve || 0, totalOnProcess: data.totalOnProcess || 0, totalFullBook: data.totalFullBook || 0, totalCancel: data.totalCancel || 0 };
    const picAgentComparison = data.picAgentComparison?.[picAgentStatus] || { agent: 0, others: 0, total: 0 };
    const picAgentTotal = Number(picAgentComparison.total || 0);
    const picAgentPct = picAgentTotal > 0 ? Math.round(((picAgentComparison.agent || 0) / picAgentTotal) * 10000) / 100 : 0;
    const allSupPct = picAgentTotal > 0 ? Math.round(((picAgentComparison.others || 0) / picAgentTotal) * 10000) / 100 : 0;
    const sourceLeadItems = (data.transactionSourceBreakdown?.[transactionChartStatus] || []).map((item, i) => ({ label: item.label, count: item.count, color: PIE_COLORS[i % PIE_COLORS.length] }));
    const unitTypeItems = (data.unitTypeBreakdown?.[transactionChartStatus] || []).map((item, i) => ({ label: item.label, count: item.count, color: PIE_COLORS[i % PIE_COLORS.length] }));
    const cancelReasonItems = (data.cancelReasonBreakdown || []).map((item, i) => ({ label: item.label || item.key || 'Lainnya', count: item.count, color: PIE_COLORS[i % PIE_COLORS.length] }));
    const selectedPicAgentStatusMeta = PIC_AGENT_STATUS_OPTIONS.find((s) => s.key === picAgentStatus) || PIC_AGENT_STATUS_OPTIONS[0];

    const renderTeamFilterPills = (value, onChange) => (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', scrollbarWidth: 'none' }}>
            {teams.map((team) => (
                <button key={team.teamId} type="button" onClick={() => onChange(team.teamId)} style={getPillButtonStyle(value === team.teamId)}>
                    {getTeamDisplayLabel(team)}
                </button>
            ))}
        </div>
    );

    const renderTeamCard = (team, maxSalesCols = 5) => {
        if (!team) return null;
        return (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>{getTeamDisplayLabel(team)}</h3>
                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Akad</span>
                    <strong style={{ fontSize: '1.8rem', color: 'var(--green)', marginTop: '4px' }}>{team.akad || 0}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['Reserve', team.reserve || 0, 'var(--text-primary)'], ['On Process', team.onProcess || 0, 'var(--primary)'], ['Full Book', team.fullBook || 0, 'var(--purple)'], ['Cancel', team.cancel || 0, 'var(--danger)']].map(([label, value, color]) => (
                        <div key={label} style={{ background: 'var(--bg-input)', padding: '10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
                            <strong style={{ fontSize: '1.3rem', color, marginTop: '4px' }}>{value}</strong>
                        </div>
                    ))}
                </div>
                {team.sales && team.sales.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span className="tpc-section-label">Sales Performance</span>
                        <TransactionSalesGrid sales={team.sales} maxCols={maxSalesCols} />
                    </div>
                ) : null}
            </div>
        );
    };

    const renderSalesScopeCard = (sales) => {
        if (!sales) return null;
        return (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>{viewerName || sales.salesName || scopeLabel}</h3>
                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Akad</span>
                    <strong style={{ fontSize: '1.8rem', color: 'var(--green)', marginTop: '4px' }}>{sales.akad || 0}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['Reserve', sales.reserve || 0, 'var(--text-primary)'], ['On Process', sales.onProcess || 0, 'var(--primary)'], ['Full Book', sales.fullBook || 0, 'var(--purple)'], ['Cancel', sales.cancel || 0, 'var(--danger)']].map(([label, value, color]) => (
                        <div key={label} style={{ background: 'var(--bg-input)', padding: '10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
                            <strong style={{ fontSize: '1.3rem', color }}>{value}</strong>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="ds-card">
            <div className="ds-card-head">
                <div>
                    <h2 className="ds-card-title">Transaction Recap</h2>
                    <span className="ds-card-summary">{data.totalOngoing || 0} ongoing • {data.totalClosing || 0} closing • {data.teams?.length || 0} teams</span>
                </div>
                {allowTeamFiltering ? (
                    <button type="button" className="tpc-compare-btn" onClick={() => setIsCompare((p) => !p)} style={getPillButtonStyle(isCompare)}>
                        {isCompare ? 'Tutup Compare' : 'Compare View'}
                    </button>
                ) : null}
            </div>

            <div className="ds-tab-body">
                {/* Filter Semua: summary numbers */}
                {allowTeamFiltering && !selectedTeamData && !effectiveCompare ? (
                    <>
                        <div onClick={() => router.push('/leads?resultFilter=akad')} style={{ cursor: 'pointer', background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--green)' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Total Akad</span>
                            <strong style={{ fontSize: '2rem', color: 'var(--green)', marginTop: '4px' }}>{summaryScope.totalAkad}</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {[['Total Full Book', summaryScope.totalFullBook, 'var(--purple)', 'full_book'], ['Total On Process', summaryScope.totalOnProcess, 'var(--primary)', 'on_process'], ['Total Reserve', summaryScope.totalReserve, 'var(--text-primary)', 'reserve'], ['Total Cancel', summaryScope.totalCancel, 'var(--danger)', 'cancel']].map(([label, value, color, filter]) => (
                                <div key={filter} onClick={() => router.push(`/leads?resultFilter=${filter}`)} style={{ cursor: 'pointer', background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
                                    <strong style={{ fontSize: '1.4rem', color, marginTop: '4px' }}>{value}</strong>
                                </div>
                            ))}
                        </div>
                    </>
                ) : null}

                {/* Filter supervisor spesifik / compare: team card */}
                {allowTeamFiltering ? (
                    effectiveCompare ? (
                        <div className="tpc-compare-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '20px' }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pilih Supervisor / PIC 1</span>
                                {renderTeamFilterPills(selectedTeam1, setSelectedTeam1)}
                                {renderTeamCard(compareTeam1Data, 2)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '20px', borderLeft: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pilih Supervisor / PIC 2</span>
                                {renderTeamFilterPills(selectedTeam2, setSelectedTeam2)}
                                {renderTeamCard(compareTeam2Data, 2)}
                            </div>
                        </div>
                    ) : selectedTeamData ? renderTeamCard(selectedTeamData) : null
                ) : isScopedSales ? renderSalesScopeCard(selectedSalesData) : isScopedSupervisor ? renderTeamCard(selectedTeamData) : null}

                {/* PIC Agent comparison */}
                {showCrossTeamInsights ? (
                    <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>PIC Agent vs All Supervisor</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid rgba(124,77,255,0.35)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PIC Agent</span>
                                <strong style={{ fontSize: '1.8rem', color: 'var(--primary)' }}>{formatCount(picAgentComparison.agent || 0)}</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{picAgentPct}% dari total {selectedPicAgentStatusMeta?.label}</span>
                            </div>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid rgba(38,166,154,0.35)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Supervisor Data</span>
                                <strong style={{ fontSize: '1.8rem', color: '#26a69a' }}>{formatCount(picAgentComparison.others || 0)}</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{allSupPct}% dari total {selectedPicAgentStatusMeta?.label}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Per Status pie charts */}
                <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Analisa Closing per Status</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        <PieChartCard title="Analisa Source Leads" subtitle="Komposisi source leads dari status transaksi terpilih." total={sourceLeadItems.reduce((s, i) => s + i.count, 0)} items={sourceLeadItems} emptyLabel="Belum ada data transaksi untuk status ini." />
                        <PieChartCard title="Komposisi Tipe Unit" subtitle="Distribusi tipe unit dari status transaksi terpilih." total={unitTypeItems.reduce((s, i) => s + i.count, 0)} items={unitTypeItems} emptyLabel="Belum ada tipe unit pada status ini." />
                        <PieChartCard title="Alasan Cancel" subtitle="Distribusi alasan cancel pada filter tanggal aktif." total={cancelReasonItems.reduce((s, i) => s + i.count, 0)} items={cancelReasonItems} emptyLabel="Belum ada data alasan cancel." />
                    </div>
                </div>
            </div>
        </div>
    );
}
