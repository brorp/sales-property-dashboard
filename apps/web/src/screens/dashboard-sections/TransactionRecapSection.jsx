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
    { key: 'cancel_transaksi', label: 'Cancel Transaksi' },
];


const TRANSACTION_STATUS_OPTIONS = [
    { value: 'all', label: 'Semua' },
    { value: 'akad', label: 'Akad' },
    { value: 'full_book', label: 'Full Book' },
    { value: 'on_process', label: 'On Process' },
    { value: 'reserve', label: 'Reserve' },
    { value: 'cancel_transaksi', label: 'Cancel Transaksi' },
];

const PIC_AGENT_SF_OPTIONS = PIC_AGENT_STATUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

function PieIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
    );
}

function BarIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
        </svg>
    );
}

function DomicileBarChart({ items, total, emptyLabel = 'Belum ada data.' }) {
    if (!items.length) return <div className="pcc-empty">{emptyLabel}</div>;
    return (
        <div className="dcc-bar-list">
            {items.map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 10000) / 100 : 0;
                return (
                    <div key={item.label} className="dcc-bar-item">
                        <div className="dcc-bar-item-row">
                            <span className="dcc-bar-dot" style={{ background: item.color }} />
                            <span className="dcc-bar-label">{item.label}</span>
                            <strong className="dcc-bar-count">{formatCount(item.count)}</strong>
                            <span className="dcc-bar-pct">{pct}%</span>
                        </div>
                        <div className="dcc-bar-track">
                            <div className="dcc-bar-fill" style={{ width: `${Math.max(1, pct)}%`, background: item.color }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function FilterIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

function SectionFilterDrawer({ open, onClose, title, options, value, onChange }) {
    if (!open) return null;
    return (
        <div className="dash-drawer-overlay" onClick={onClose}>
            <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="dash-drawer-header">
                    <span className="dash-drawer-title">{title}</span>
                    <button type="button" className="ds-section-filter-btn" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>
                <div className="dash-drawer-body">
                    <div className="sfd-list">
                        {options.map((opt) => {
                            const isActive = value === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`sfd-item${isActive ? ' active' : ''}`}
                                    onClick={() => { onChange(opt.value); onClose(); }}
                                >
                                    <span className="sfd-item-dot" />
                                    <span className="sfd-item-label">{opt.label}</span>
                                    {opt.count !== undefined && (
                                        <span className="sfd-item-count">{formatCount(opt.count)}</span>
                                    )}
                                    <span className="sfd-item-check"><CheckIcon /></span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TransactionRecapSection({
    data, onUnitTypeChange,
    allowTeamFiltering = true, showCrossTeamInsights = true,
    scopeLabel = 'Semua Supervisor', viewerRole = '', viewerId = '', viewerName = '',
    selectedTeam = 'all',
    unitType = '',
    forceCompare = false,
    periodLabel = '',
    rangeSummary = '',
}) {
    const router = useRouter();
    const [picAgentStatus, setPicAgentStatus] = useState('akad');
    const [transactionChartStatus, setTransactionChartStatus] = useState('all');
    const [picAgentDrawerOpen, setPicAgentDrawerOpen] = useState(false);
    const [analysisDrawerOpen, setAnalysisDrawerOpen] = useState(false);
    const [statsDrawerOpen, setStatsDrawerOpen] = useState(false);
    const [domicileChartType, setDomicileChartType] = useState('pie');
    const teams = data?.teams || [];
    const isCompare = forceCompare;
    const [visibleStats, setVisibleStats] = useState(['reserve', 'on_process', 'akad', 'full_book', 'cancel']);

    const toggleStat = (key) => setVisibleStats((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
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
    const domicileItems = (data.transactionDomicileBreakdown?.[transactionChartStatus] || []).map((item, i) => ({ label: item.label, count: item.count, color: PIE_COLORS[i % PIE_COLORS.length] }));

    const domicileNonCancelItems = (data.transactionDomicileBreakdown?.[transactionChartStatus] || []).map((item, i) => ({ ...item, color: PIE_COLORS[i % PIE_COLORS.length] }));
    const domicileNonCancelTotal = domicileNonCancelItems.reduce((s, i) => s + i.count, 0);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2 className="ds-card-title">Rekap Transaksi</h2>
                        {periodLabel ? <span className="tpc-period-badge">{periodLabel}</span> : null}
                    </div>
                    <span className="ds-card-summary">{data.totalOngoing || 0} berjalan • {data.totalClosing || 0} closing • {data.teams?.length || 0} tim</span>
                    {rangeSummary ? <span className="tpc-range-summary">{rangeSummary}</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {allowTeamFiltering && !selectedTeamData && !effectiveCompare ? (
                        <button
                            type="button"
                            className={`ds-section-filter-btn${visibleStats.length > 2 ? ' is-active' : ''}`}
                            onClick={() => setStatsDrawerOpen(true)}
                            title="Pilih statistik"
                        >
                            <FilterIcon />
                            {visibleStats.length > 2 ? <span className="ds-section-filter-dot" /> : null}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="ds-tab-body">
                {/* Filter Semua: summary numbers */}
                {allowTeamFiltering && !selectedTeamData && !effectiveCompare ? (() => {
                    const ALL_STAT_DEFS = [
                        { key: 'akad', label: 'Total Akad', color: 'var(--green)', value: summaryScope.totalAkad, filter: 'akad' },
                        { key: 'full_book', label: 'Total Full Book', color: 'var(--purple)', value: summaryScope.totalFullBook, filter: 'full_book' },
                        { key: 'on_process', label: 'Total On Process', color: 'var(--primary)', value: summaryScope.totalOnProcess, filter: 'on_process' },
                        { key: 'reserve', label: 'Total Reserve', color: 'var(--text-primary)', value: summaryScope.totalReserve, filter: 'reserve' },
                        { key: 'cancel', label: 'Total Batal', color: 'var(--danger)', value: summaryScope.totalCancel, filter: 'cancel_transaksi' },
                    ];
                    const OPTIONAL_KEYS = ['akad', 'on_process', 'reserve'];
                    const visibleItems = ALL_STAT_DEFS.filter((s) => visibleStats.includes(s.key));
                    const n = visibleItems.length;
                    const desktopRem = n % 3;
                    return (
                        <div className="tpc-stat-grid">
                            {visibleItems.map((s, idx) => {
                                const cls = ['tpc-stat-item'];
                                if (n % 2 === 1 && idx === n - 1) cls.push('tpc-stat-item--mob-full');
                                if (desktopRem === 1 && idx === n - 1) cls.push('tpc-stat-item--desk-full');
                                else if (desktopRem === 2 && idx >= n - 2) cls.push('tpc-stat-item--desk-half');
                                return (
                                    <div
                                        key={s.key}
                                        className={cls.join(' ')}
                                        onClick={() => router.push(`/leads?resultFilter=${s.filter}`)}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = s.color; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                                    >
                                        <span className="tpc-stat-label">{s.label}</span>
                                        <strong className="tpc-stat-value" style={{ color: s.color }}>{s.value}</strong>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })() : null}

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

                {/* Per Status pie charts */}
                {!effectiveCompare ? <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Analisa Closing per Status</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="dcc-chart-toggle">
                                <button type="button" className={`dcc-chart-toggle-btn${domicileChartType === 'pie' ? ' active' : ''}`} onClick={() => setDomicileChartType('pie')}>
                                    <PieIcon /> Pie
                                </button>
                                <button type="button" className={`dcc-chart-toggle-btn${domicileChartType === 'bar' ? ' active' : ''}`} onClick={() => setDomicileChartType('bar')}>
                                    <BarIcon /> Bar
                                </button>
                            </div>
                            <button type="button" onClick={() => setAnalysisDrawerOpen(true)} className={`ds-section-filter-btn${transactionChartStatus !== 'all' ? ' is-active' : ''}`}>
                                <FilterIcon />
                                {transactionChartStatus !== 'all' && <span className="ds-section-filter-dot" />}
                            </button>
                        </div>
                    </div>
                    <div className="tpc-charts-grid">
                        {[
                            { title: 'Analisa Source Leads', subtitle: 'Komposisi source leads dari status transaksi terpilih.', items: sourceLeadItems, emptyLabel: 'Belum ada data transaksi untuk status ini.' },
                            { title: 'Komposisi Tipe Unit', subtitle: 'Distribusi tipe unit dari status transaksi terpilih.', items: unitTypeItems, emptyLabel: 'Belum ada tipe unit pada status ini.' },
                            { title: 'Domisili', subtitle: 'Distribusi domisili dari leads yang sudah masuk L4 non-cancel.', items: domicileItems, emptyLabel: 'Belum ada data domisili.' },
                            { title: 'Alasan Cancel', subtitle: 'Distribusi alasan cancel pada filter tanggal aktif.', items: cancelReasonItems, emptyLabel: 'Belum ada data alasan cancel.' },
                        ].map(({ title, subtitle, items, emptyLabel }) => {
                            const total = items.reduce((s, i) => s + i.count, 0);
                            if (domicileChartType === 'bar') {
                                return (
                                    <div key={title} className="pcc">
                                        <div className="pcc-header">
                                            <h4 className="pcc-title">{title}</h4>
                                            <span className="pcc-subtitle">{subtitle}</span>
                                        </div>
                                        <DomicileBarChart items={items} total={total} emptyLabel={emptyLabel} />
                                    </div>
                                );
                            }
                            return <PieChartCard key={title} title={title} subtitle={subtitle} total={total} items={items} emptyLabel={emptyLabel} />;
                        })}
                    </div>
                </div> : null}
            </div>
            <SectionFilterDrawer
                open={picAgentDrawerOpen}
                onClose={() => setPicAgentDrawerOpen(false)}
                title="Filter Divisi Closing Group"
                options={PIC_AGENT_SF_OPTIONS}
                value={picAgentStatus}
                onChange={setPicAgentStatus}
            />
            <SectionFilterDrawer
                open={analysisDrawerOpen}
                onClose={() => setAnalysisDrawerOpen(false)}
                title="Filter Analisa Closing per Status"
                options={TRANSACTION_STATUS_OPTIONS}
                value={transactionChartStatus}
                onChange={setTransactionChartStatus}
            />

            {/* Stats visibility drawer */}
            {statsDrawerOpen ? (
                <div className="dash-drawer-overlay" onClick={() => setStatsDrawerOpen(false)}>
                    <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="dash-drawer-header">
                            <span className="dash-drawer-title">Tampilkan Statistik</span>
                            <button type="button" className="ds-section-filter-btn" onClick={() => setStatsDrawerOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>
                        <div className="dash-drawer-body">
                            <div className="tpc-stats-toggle-list">
                                {[
                                    { key: 'full_book', label: 'Full Book', color: 'var(--purple)', locked: false },
                                    { key: 'cancel', label: 'Cancel', color: 'var(--danger)', locked: false },
                                    { key: 'akad', label: 'Akad', color: 'var(--green)', locked: false },
                                    { key: 'on_process', label: 'On Process', color: 'var(--primary)', locked: false },
                                    { key: 'reserve', label: 'Reserve', color: 'var(--text-primary)', locked: false },
                                ].map(({ key, label, color, locked }) => {
                                    const active = visibleStats.includes(key);
                                    return (
                                        <div key={key} className={`tpc-stats-toggle-item${locked ? ' locked' : ''}`}>
                                            <span className="tpc-stats-toggle-dot" style={{ background: color }} />
                                            <span className="tpc-stats-toggle-label">{label}</span>
                                            <button
                                                type="button"
                                                className={`tpc-stats-toggle-switch${active ? ' active' : ''}`}
                                                onClick={() => toggleStat(key)}
                                                style={active ? { '--sw-color': color } : undefined}
                                            >
                                                <span className="tpc-stats-toggle-thumb" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
