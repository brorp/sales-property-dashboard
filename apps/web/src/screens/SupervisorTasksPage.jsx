'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';
import { getSalesStatusLabel, getTimeAgo } from '../constants/crm';
import './SupervisorTasksPage.css';

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const IconPhone = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6 6l1.92-1.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
);

const IconUser = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const IconClock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const IconMegaphone = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
);

const IconNudge = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const IconCheck = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

function SpvEmpty({ variant = 'default', title, desc }) {
    const variants = {
        loading: {
            color: '#94A3B8', bg: '#F1F5F9',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="spv-empty-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
            ),
        },
        success: {
            color: '#16A34A', bg: '#DCFCE7',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <polyline points="9 12 11 14 15 10"/>
                </svg>
            ),
        },
        clipboard: {
            color: '#2563EB', bg: '#DBEAFE',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>
                </svg>
            ),
        },
        snow: {
            color: '#0EA5E9', bg: '#E0F2FE',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22"/>
                    <path d="m20 6-8 6-8-6"/>
                    <path d="m20 18-8-6-8 6"/>
                    <path d="m2 12 4-2-4-2"/>
                    <path d="m22 12-4-2 4-2"/>
                </svg>
            ),
        },
        search: {
            color: '#7C3AED', bg: '#EDE9FE',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
            ),
        },
    };
    const v = variants[variant] || variants.default;
    return (
        <div className="spv-empty">
            <div className="spv-empty-icon" style={{ background: v.bg, color: v.color }}>
                {v.icon}
            </div>
            <div className="spv-empty-title">{title}</div>
            {desc ? <div className="spv-empty-desc">{desc}</div> : null}
        </div>
    );
}


export default function SupervisorTasksPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeSection, setActiveSection] = useState('hot_leads');
    const [leads, setLeads] = useState([]);
    const [submittedTaskGroups, setSubmittedTaskGroups] = useState([]);
    const [deadlineTaskGroups, setDeadlineTaskGroups] = useState([]);
    const [managedSales, setManagedSales] = useState([]);
    const [submittedSalesFilter, setSubmittedSalesFilter] = useState('all');
    const [deadlineSalesFilter, setDeadlineSalesFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');
    const [rejectNotes, setRejectNotes] = useState({});
    const [showRejectNote, setShowRejectNote] = useState({});
    const [lightboxImage, setLightboxImage] = useState(null);
    const [filterSheet, setFilterSheet] = useState(null); // 'submitted' | 'cold' | null
    const [filterSearch, setFilterSearch] = useState('');
    const [submittedNameSearch, setSubmittedNameSearch] = useState('');
    const [coldNameSearch, setColdNameSearch] = useState('');

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    const handleNudgeSales = (salesId, salesName, leadName, leadPhone) => {
        const salesMember = managedSales.find(s => s.id === salesId);
        const salesPhone = salesMember?.phone || '';
        const cleanPhone = salesPhone.replace(/[^0-9]/g, '');
        const text = `Halo ${salesName}, mohon segera menindaklanjuti Cold Lead *${leadName}* (${leadPhone}) ya. Terima kasih!`;
        const url = cleanPhone
            ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
            : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const loadLeads = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) { setLoading(true); setError(''); }
        try {
            const [pendingData, submittedData, deadlineData, salesData] = await Promise.all([
                apiRequest('/api/supervisor-tasks', { user }),
                apiRequest('/api/supervisor-tasks/submitted-daily-tasks', { user }),
                apiRequest('/api/supervisor-tasks/deadline-leads', { user }),
                apiRequest('/api/sales', { user }),
            ]);
            setLeads(Array.isArray(pendingData) ? pendingData : []);
            setSubmittedTaskGroups(Array.isArray(submittedData) ? submittedData : []);
            setDeadlineTaskGroups(Array.isArray(deadlineData) ? deadlineData : []);
            setManagedSales(Array.isArray(salesData) ? salesData : []);
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Gagal memuat data');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    useEffect(() => { void loadLeads(); }, [loadLeads]);

    const submittedTaskCountBySalesId = useMemo(() => {
        const next = new Map();
        for (const group of submittedTaskGroups) {
            next.set(group.salesId, group.taskCount || 0);
        }
        return next;
    }, [submittedTaskGroups]);
    const submittedSalesOptions = useMemo(() => (
        (managedSales.length > 0 ? managedSales : submittedTaskGroups).map((item) => ({
            salesId: item.id || item.salesId,
            salesName: item.name || item.salesName || 'Sales',
            taskCount: submittedTaskCountBySalesId.get(item.id || item.salesId) || 0,
        })).filter((item) => item.salesId)
    ), [managedSales, submittedTaskCountBySalesId, submittedTaskGroups]);
    const visibleSubmittedTaskGroups = useMemo(() => (
        submittedSalesFilter === 'all'
            ? submittedTaskGroups
            : submittedTaskGroups.filter((group) => group.salesId === submittedSalesFilter)
    ), [submittedSalesFilter, submittedTaskGroups]);
    const visibleSubmittedTaskCount = useMemo(() => (
        visibleSubmittedTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [visibleSubmittedTaskGroups]);
    const deadlineTaskCountBySalesId = useMemo(() => {
        const next = new Map();
        for (const group of deadlineTaskGroups) {
            next.set(group.salesId, group.taskCount || 0);
        }
        return next;
    }, [deadlineTaskGroups]);
    const deadlineSalesOptions = useMemo(() => (
        (managedSales.length > 0 ? managedSales : deadlineTaskGroups).map((item) => ({
            salesId: item.id || item.salesId,
            salesName: item.name || item.salesName || 'Sales',
            taskCount: deadlineTaskCountBySalesId.get(item.id || item.salesId) || 0,
        })).filter((item) => item.salesId)
    ), [deadlineTaskCountBySalesId, deadlineTaskGroups, managedSales]);
    const visibleDeadlineTaskGroups = useMemo(() => (
        deadlineSalesFilter === 'all'
            ? deadlineTaskGroups
            : deadlineTaskGroups.filter((group) => group.salesId === deadlineSalesFilter)
    ), [deadlineSalesFilter, deadlineTaskGroups]);
    const visibleDeadlineTaskCount = useMemo(() => (
        visibleDeadlineTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [visibleDeadlineTaskGroups]);
    const submittedTotalCount = useMemo(() => (
        submittedTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [submittedTaskGroups]);
    const deadlineTotalCount = useMemo(() => (
        deadlineTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [deadlineTaskGroups]);

    useEffect(() => {
        if (
            submittedSalesFilter !== 'all' &&
            !submittedSalesOptions.some((option) => option.salesId === submittedSalesFilter)
        ) {
            setSubmittedSalesFilter('all');
        }
    }, [submittedSalesFilter, submittedSalesOptions]);

    useEffect(() => {
        if (
            deadlineSalesFilter !== 'all' &&
            !deadlineSalesOptions.some((option) => option.salesId === deadlineSalesFilter)
        ) {
            setDeadlineSalesFilter('all');
        }
    }, [deadlineSalesFilter, deadlineSalesOptions]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 5000,
        run: async () => {
            if (actionLoading) return;
            await loadLeads({ silent: true });
        },
    });

    const handleValidate = async (leadId) => {
        setActionLoading(leadId);
        setActionError('');
        setActionSuccess('');
        try {
            await apiRequest(`/api/supervisor-tasks/${leadId}/validate`, {
                method: 'POST',
                user,
            });
            setActionSuccess('Lead berhasil divalidasi sebagai HOT | VALIDATED.');
            await loadLeads({ silent: true });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Gagal memvalidasi lead');
        } finally {
            setActionLoading('');
        }
    };

    const handleReject = async (leadId) => {
        const note = rejectNotes[leadId] || '';
        setActionLoading(leadId);
        setActionError('');
        setActionSuccess('');
        try {
            await apiRequest(`/api/supervisor-tasks/${leadId}/reject`, {
                method: 'POST',
                user,
                body: { note },
            });
            setActionSuccess('Lead berhasil ditolak.');
            setShowRejectNote((prev) => ({ ...prev, [leadId]: false }));
            setRejectNotes((prev) => ({ ...prev, [leadId]: '' }));
            await loadLeads({ silent: true });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Gagal menolak lead');
        } finally {
            setActionLoading('');
        }
    };

    const toggleRejectNote = (leadId) => {
        setShowRejectNote((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
    };

    const renderSalesFilter = ({ options, value, onChange, totalCount, sheetKey, nameSearch, setNameSearch }) => {
        if (options.length === 0) return null;
        const activeLabel = value === 'all'
            ? null
            : options.find((o) => o.salesId === value)?.salesName;
        return (
            <div className="spv-filter-bar" style={{ marginTop: '70px' }}>
                {/* Search + filter icon side by side */}
                <div className="spv-filter-row">
                    <div className="spv-name-search-wrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spv-name-search-icon">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                            type="text"
                            className="spv-name-search"
                            placeholder="Cari nama lead..."
                            value={nameSearch}
                            onChange={(e) => setNameSearch(e.target.value)}
                        />
                        {nameSearch ? (
                            <button type="button" className="spv-sheet-search-clear" onClick={() => setNameSearch('')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        className={`spv-filter-trigger${activeLabel ? ' is-active' : ''}`}
                        onClick={() => setFilterSheet(sheetKey)}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                        </svg>
                        {activeLabel ? (
                            <>
                                <span className="spv-filter-trigger-label">{activeLabel}</span>
                                <span className="spv-filter-clear" role="button" onClick={(e) => { e.stopPropagation(); onChange('all'); }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </span>
                            </>
                        ) : null}
                    </button>
                </div>

                {/* Sales filter bottom sheet */}
                {filterSheet === sheetKey ? (
                    <div className="sheet-overlay" onClick={() => { setFilterSheet(null); setFilterSearch(''); }}>
                        <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
                            <div className="sheet-handle" />
                            <h2>Filter by Sales</h2>
                            <div className="spv-sheet-search-wrap">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spv-sheet-search-icon">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input
                                    type="text"
                                    className="spv-sheet-search"
                                    placeholder="Cari sales..."
                                    value={filterSearch}
                                    onChange={(e) => setFilterSearch(e.target.value)}
                                    autoFocus
                                />
                                {filterSearch ? (
                                    <button type="button" className="spv-sheet-search-clear" onClick={() => setFilterSearch('')}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                ) : null}
                            </div>
                            <div className="spv-sheet-list">
                                {!filterSearch ? (
                                    <button
                                        type="button"
                                        className={`spv-sheet-item${value === 'all' ? ' is-active' : ''}`}
                                        onClick={() => { onChange('all'); setFilterSheet(null); setFilterSearch(''); }}
                                    >
                                        <span>Semua</span>
                                        <span className="spv-sheet-count">{totalCount}</span>
                                        {value === 'all' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                    </button>
                                ) : null}
                                {options
                                    .filter((o) => o.salesName.toLowerCase().includes(filterSearch.toLowerCase()))
                                    .map((o) => (
                                        <button
                                            key={o.salesId}
                                            type="button"
                                            className={`spv-sheet-item${value === o.salesId ? ' is-active' : ''}`}
                                            onClick={() => { onChange(o.salesId); setFilterSheet(null); setFilterSearch(''); }}
                                        >
                                            <span>{o.salesName}</span>
                                            <span className="spv-sheet-count">{o.taskCount}</span>
                                            {value === o.salesId && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                        </button>
                                    ))
                                }
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className="page-container">
            <Header title="Supervisor Tasks" />

            <div className="daily-task-tabs">
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'hot_leads' ? 'is-active' : ''}`}
                    onClick={() => setActiveSection('hot_leads')}
                >
                    Hot Leads
                    {leads.length > 0 ? <span className="daily-task-tab-badge">{leads.length}</span> : null}
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'submitted_tasks' ? 'is-active' : ''}`}
                    onClick={() => setActiveSection('submitted_tasks')}
                >
                    Task Submissions
                    {submittedTotalCount > 0 ? <span className="daily-task-tab-badge">{submittedTotalCount}</span> : null}
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'cold_leads' ? 'is-active' : ''}`}
                    onClick={() => setActiveSection('cold_leads')}
                >
                    Cold Leads
                    {deadlineTotalCount > 0 ? <span className="daily-task-tab-badge">{deadlineTotalCount}</span> : null}
                </button>
            </div>


            {activeSection === 'hot_leads' ? (
                <section>
                    {actionError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{actionError}</div>}
                    {actionSuccess && <div className="alert alert-success" style={{ marginBottom: 12 }}>{actionSuccess}</div>}

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat data..." />
                    ) : leads.length === 0 ? (
                        <SpvEmpty variant="success" title="Semua lead tervalidasi" desc="Tidak ada lead HOT yang menunggu validasi saat ini." />
                    ) : (
                        <div className="spv-card-list" style={{ marginTop: '70px' }}>
                            {leads.map((lead) => {
                                const isBusy = actionLoading === lead.id;
                                return (
                                    <div key={lead.id} className="spv-card spv-card-hot">
                                        <div className="spv-card-header">
                                            <span
                                                className="spv-card-title spv-card-title-link"
                                                onClick={() => router.push(`/leads/${lead.id}`)}
                                            >
                                                {lead.name}
                                            </span>
                                            <span className="badge badge-hot">HOT</span>
                                        </div>

                                        <div className="spv-card-meta-grid">
                                            <span className="spv-meta-item"><IconPhone /> {lead.phone}</span>
                                            <span className="spv-meta-item"><IconUser /> {lead.assignedUserName || '-'}</span>
                                            <span className="spv-meta-item"><IconClock /> {getTimeAgo(lead.updatedAt)}</span>
                                            <span className="spv-meta-item"><IconMegaphone /> {lead.source}</span>
                                        </div>

                                        {showRejectNote[lead.id] ? (
                                            <div className="input-group" style={{ marginTop: 0 }}>
                                                <label>Catatan Penolakan (opsional)</label>
                                                <input
                                                    type="text"
                                                    className="input-field"
                                                    placeholder="Alasan penolakan..."
                                                    value={rejectNotes[lead.id] || ''}
                                                    onChange={(e) => setRejectNotes((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                                                />
                                            </div>
                                        ) : null}

                                        <div className="spv-card-actions">
                                            <button
                                                type="button"
                                                className="btn btn-sm spv-btn-validate"
                                                disabled={isBusy}
                                                onClick={() => void handleValidate(lead.id)}
                                            >
                                                {isBusy ? 'Memproses...' : <><IconCheck /> Validasi</>}
                                            </button>
                                            {!showRejectNote[lead.id] ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm spv-btn-reject"
                                                    disabled={isBusy}
                                                    onClick={() => toggleRejectNote(lead.id)}
                                                >
                                                    <IconX /> Tolak
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#dc2626' }}
                                                        disabled={isBusy}
                                                        onClick={() => void handleReject(lead.id)}
                                                    >
                                                        {isBusy ? 'Memproses...' : 'Konfirmasi Tolak'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        disabled={isBusy}
                                                        onClick={() => toggleRejectNote(lead.id)}
                                                    >
                                                        Batal
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            ) : null}

            {activeSection === 'submitted_tasks' ? (
                <section>
                    {renderSalesFilter({
                        options: submittedSalesOptions,
                        value: submittedSalesFilter,
                        onChange: setSubmittedSalesFilter,
                        totalCount: submittedTotalCount,
                        sheetKey: 'submitted',
                        nameSearch: submittedNameSearch,
                        setNameSearch: setSubmittedNameSearch,
                    })}

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat submission task..." />
                    ) : submittedTaskGroups.length === 0 ? (
                        <SpvEmpty variant="clipboard" title="Belum ada submission" desc="Task yang disubmit sales akan muncul di sini selama 24 jam ke depan." />
                    ) : visibleSubmittedTaskGroups.length === 0 ? (
                        <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleSubmittedTaskGroups
                                .map((group) => {
                                    const tasks = submittedNameSearch
                                        ? group.tasks.filter((t) => t.leadName?.toLowerCase().includes(submittedNameSearch.toLowerCase()))
                                        : group.tasks;
                                    if (tasks.length === 0) return null;
                                    return (
                                <div key={group.salesId} className="spv-card spv-card-submitted">
                                    <div className="spv-card-header">
                                        <span className="spv-card-title">{group.salesName}</span>
                                        <span className="badge badge-info">{tasks.length} task</span>
                                    </div>

                                    <div className="spv-tasks-container">
                                        {tasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={`spv-task-sub-item ${!task.screenshotUrl ? 'spv-task-sub-noimg' : ''}`}
                                            >
                                                <div>
                                                    <div
                                                        className="spv-card-title spv-card-title-link"
                                                        style={{ fontSize: '0.875rem', marginBottom: 6 }}
                                                        onClick={() => router.push(`/leads/${task.leadId}`)}
                                                    >
                                                        {task.leadName}
                                                    </div>
                                                    <div className="spv-card-meta-grid" style={{ borderTop: 'none', borderBottom: 'none', paddingTop: 0, paddingBottom: 0, gap: '4px 12px' }}>
                                                        <span className="spv-meta-item"><IconPhone /> {task.leadPhone}</span>
                                                        <span className="spv-meta-item"><IconMegaphone /> {task.leadSource}</span>
                                                        <span className="spv-meta-item"><IconClock /> {getTimeAgo(task.completedAt)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                        <span className="badge badge-info">{task.label}</span>
                                                        {task.submittedSalesStatus ? (
                                                            <span className="badge badge-warm">{task.submittedSalesStatus.toUpperCase()}</span>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                {task.screenshotUrl ? (
                                                    <img
                                                        src={task.screenshotUrl}
                                                        alt={`${task.label} proof`}
                                                        className="spv-task-proof-img"
                                                        onClick={() => setLightboxImage({ url: task.screenshotUrl, caption: `${group.salesName} — ${task.label}` })}
                                                    />
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                    );
                                })}
                        </div>
                    )}
                </section>
            ) : null}

            {activeSection === 'cold_leads' ? (
                <section>
                    {renderSalesFilter({
                        options: deadlineSalesOptions,
                        value: deadlineSalesFilter,
                        onChange: setDeadlineSalesFilter,
                        totalCount: deadlineTotalCount,
                        sheetKey: 'cold',
                        nameSearch: coldNameSearch,
                        setNameSearch: setColdNameSearch,
                    })}

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat Cold Leads..." />
                    ) : deadlineTaskGroups.length === 0 ? (
                        <SpvEmpty variant="snow" title="Tidak ada Cold Leads" desc="Lead muncul di sini saat hari ke-14 belum di-follow up oleh sales." />
                    ) : visibleDeadlineTaskGroups.length === 0 ? (
                        <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleDeadlineTaskGroups
                                .map((group) => {
                                    const tasks = coldNameSearch
                                        ? group.tasks.filter((t) => t.leadName?.toLowerCase().includes(coldNameSearch.toLowerCase()))
                                        : group.tasks;
                                    if (tasks.length === 0) return null;
                                    return (
                                <div key={group.salesId} className="spv-card spv-card-cold">
                                    <div className="spv-card-header">
                                        <span className="spv-card-title">{group.salesName}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="badge badge-danger">{tasks.length} leads</span>
                                            <button
                                                type="button"
                                                className="btn btn-sm spv-nudge-btn"
                                                onClick={() => handleNudgeSales(
                                                    group.salesId,
                                                    group.salesName,
                                                    `${tasks.length} lead`,
                                                    ''
                                                )}
                                            >
                                                <IconNudge /> Nudge
                                            </button>
                                        </div>
                                    </div>

                                    <div className="spv-tasks-container">
                                        {tasks.map((task) => (
                                            <div key={task.id} className="spv-task-sub-item spv-task-sub-noimg">
                                                <div>
                                                    <div
                                                        className="spv-card-title spv-card-title-link"
                                                        style={{ fontSize: '0.875rem', marginBottom: 6 }}
                                                        onClick={() => router.push(`/leads/${task.leadId}`)}
                                                    >
                                                        {task.leadName}
                                                    </div>
                                                    <div className="spv-card-meta-grid" style={{ borderTop: 'none', borderBottom: 'none', paddingTop: 0, paddingBottom: 0, gap: '4px 12px' }}>
                                                        <span className="spv-meta-item"><IconPhone /> {task.leadPhone}</span>
                                                        <span className="spv-meta-item"><IconMegaphone /> {task.leadSource}</span>
                                                        <span className="spv-meta-item"><IconClock /> Lead age: {getTimeAgo(task.createdAt)}</span>
                                                        <span className="spv-meta-item"><IconUser /> Deadline: {formatDateTime(task.dueAt)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                        <span className="badge badge-danger">Deadline Leads</span>
                                                        {task.salesStatus ? (
                                                            <span className={`badge ${task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'}`}>
                                                                {getSalesStatusLabel(task.salesStatus)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                    );
                                })}
                        </div>
                    )}
                </section>
            ) : null}

            {lightboxImage ? (
                <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="lightbox-close"
                            onClick={() => setLightboxImage(null)}
                            aria-label="Tutup"
                        >
                            ✕
                        </button>
                        <img src={lightboxImage.url} alt={lightboxImage.caption} className="lightbox-img" />
                        {lightboxImage.caption ? (
                            <div className="lightbox-caption">{lightboxImage.caption}</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
