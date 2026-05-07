'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';
import { getSalesStatusLabel, getTimeAgo } from '../constants/crm';

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getFilterButtonStyle(active) {
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

    const renderSalesFilter = ({ options, value, onChange, totalCount }) => (
        options.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter by Sales</span>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                    <button
                        type="button"
                        onClick={() => onChange('all')}
                        style={getFilterButtonStyle(value === 'all')}
                    >
                        Semua ({totalCount})
                    </button>
                    {options.map((option) => (
                        <button
                            key={option.salesId}
                            type="button"
                            onClick={() => onChange(option.salesId)}
                            style={getFilterButtonStyle(value === option.salesId)}
                        >
                            {option.salesName} ({option.taskCount})
                        </button>
                    ))}
                </div>
            </div>
        ) : null
    );

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
                    Daily Task Submission 24 Jam Terakhir
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
            <section className="dash-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                        Hot Leads
                    </h2>
                    <span className="badge badge-hot" style={{ fontSize: '0.82rem' }}>
                        {leads.length} pending
                    </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>
                    Lead di bawah ini telah ditandai HOT oleh sales Anda. Validasi untuk mengkonfirmasi, atau tolak untuk mengembalikan ke status Warm.
                </p>

                {loading ? (
                    <div className="empty-state">
                        <div className="empty-desc">Memuat data...</div>
                    </div>
                ) : leads.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">✅</div>
                        <div className="empty-title">Tidak ada lead menunggu validasi</div>
                        <div className="empty-desc">Semua lead HOT sudah divalidasi.</div>
                    </div>
                ) : (
                    <div className="card-list">
                        {leads.map((lead) => {
                            const isBusy = actionLoading === lead.id;
                            return (
                                <div key={lead.id} className="card">
                                    <div className="lead-row-top">
                                        <div className="lead-row-name"
                                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => router.push(`/leads/${lead.id}`)}
                                        >
                                            {lead.name}
                                        </div>
                                        <span className="badge badge-hot">HOT</span>
                                    </div>
                                    <div className="lead-row-meta">
                                        <span>📱 {lead.phone}</span>
                                        <span>👤 {lead.assignedUserName || '-'}</span>
                                    </div>
                                    <div className="lead-row-meta">
                                        <span>🕒 Diupdate {getTimeAgo(lead.updatedAt)}</span>
                                        <span>📣 {lead.source}</span>
                                    </div>

                                    {showRejectNote[lead.id] ? (
                                        <div className="input-group" style={{ marginTop: 10 }}>
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

                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            disabled={isBusy}
                                            onClick={() => void handleValidate(lead.id)}
                                        >
                                            {isBusy ? 'Memproses...' : '✅ Validasi'}
                                        </button>
                                        {!showRejectNote[lead.id] ? (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                disabled={isBusy}
                                                onClick={() => toggleRejectNote(lead.id)}
                                            >
                                                ❌ Tolak
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: 'var(--danger, #ef4444)' }}
                                                disabled={isBusy}
                                                onClick={() => void handleReject(lead.id)}
                                            >
                                                {isBusy ? 'Memproses...' : 'Konfirmasi Tolak'}
                                            </button>
                                        )}
                                        {showRejectNote[lead.id] ? (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                disabled={isBusy}
                                                onClick={() => toggleRejectNote(lead.id)}
                                            >
                                                Batal
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
            ) : null}

            {activeSection === 'submitted_tasks' ? (
            <section className="dash-section" style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                        Daily Task Submission 24 Jam Terakhir
                    </h2>
                    <span className="badge badge-info" style={{ fontSize: '0.82rem' }}>
                        {visibleSubmittedTaskCount} task
                    </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>
                    Supervisor hanya melihat submission task yang sudah dikirim sales dalam 24 jam terakhir. Data lama otomatis tidak ditampilkan agar list tetap ringkas.
                </p>

                {renderSalesFilter({
                    options: submittedSalesOptions,
                    value: submittedSalesFilter,
                    onChange: setSubmittedSalesFilter,
                    totalCount: submittedTotalCount,
                })}

                {loading ? (
                    <div className="empty-state">
                        <div className="empty-desc">Memuat submission task...</div>
                    </div>
                ) : submittedTaskGroups.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🗂️</div>
                        <div className="empty-title">Belum ada submission task terbaru</div>
                        <div className="empty-desc">Task yang sudah disubmit oleh sales akan muncul di sini selama 24 jam.</div>
                    </div>
                ) : visibleSubmittedTaskGroups.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🗂️</div>
                        <div className="empty-title">Tidak ada submission untuk sales ini</div>
                        <div className="empty-desc">Pilih sales lain atau tampilkan semua submission 24 jam terakhir.</div>
                    </div>
                ) : (
                    <div className="card-list">
                        {visibleSubmittedTaskGroups.map((group) => (
                            <div key={group.salesId} className="card">
                                <div className="lead-row-top">
                                    <div className="lead-row-name">{group.salesName}</div>
                                    <span className="badge badge-info">{group.taskCount} task</span>
                                </div>

                                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                                    {group.tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: task.screenshotUrl ? '64px 1fr' : '1fr',
                                                gap: 12,
                                                alignItems: 'start',
                                                padding: 12,
                                                borderRadius: 12,
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            {task.screenshotUrl ? (
                                                <a href={task.screenshotUrl} target="_blank" rel="noopener noreferrer">
                                                    <img
                                                        src={task.screenshotUrl}
                                                        alt={`${task.label} proof`}
                                                        style={{
                                                            width: 64,
                                                            height: 64,
                                                            objectFit: 'cover',
                                                            borderRadius: 10,
                                                            display: 'block',
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                        }}
                                                    />
                                                </a>
                                            ) : null}

                                            <div>
                                                <div
                                                    className="lead-row-name"
                                                    style={{ cursor: 'pointer', textDecoration: 'underline', marginBottom: 6 }}
                                                    onClick={() => router.push(`/leads/${task.leadId}`)}
                                                >
                                                    {task.leadName}
                                                </div>
                                                <div className="lead-row-meta">
                                                    <span>📱 {task.leadPhone}</span>
                                                    <span>📣 {task.leadSource}</span>
                                                </div>
                                                <div className="lead-row-meta" style={{ marginTop: 6 }}>
                                                    <span className="badge badge-info">{task.label}</span>
                                                    {task.submittedSalesStatus ? (
                                                        <span className="badge badge-warm">{task.submittedSalesStatus.toUpperCase()}</span>
                                                    ) : null}
                                                </div>
                                                <div className="lead-row-meta" style={{ marginTop: 6 }}>
                                                    <span>✅ Submit {formatDateTime(task.completedAt)}</span>
                                                    <span>⏱️ {getTimeAgo(task.completedAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
            ) : null}

            {activeSection === 'cold_leads' ? (
                <section className="dash-section" style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h2 className="section-title" style={{ margin: 0 }}>
                            Cold Leads
                        </h2>
                        <span className="badge badge-danger" style={{ fontSize: '0.82rem' }}>
                            {visibleDeadlineTaskCount} leads
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>
                        Data ini mengikuti Deadline Leads milik sales: lead warm hari ke-14 tanpa appointment dan tanpa status L4. Supervisor hanya melihat data, tanpa action.
                    </p>

                    {renderSalesFilter({
                        options: deadlineSalesOptions,
                        value: deadlineSalesFilter,
                        onChange: setDeadlineSalesFilter,
                        totalCount: deadlineTotalCount,
                    })}

                    {loading ? (
                        <div className="empty-state">
                            <div className="empty-desc">Memuat Cold Leads...</div>
                        </div>
                    ) : deadlineTaskGroups.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">❄️</div>
                            <div className="empty-title">Tidak ada Cold Leads</div>
                            <div className="empty-desc">Lead akan muncul saat masuk reminder hari ke-14 dan belum di-action sales.</div>
                        </div>
                    ) : visibleDeadlineTaskGroups.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">❄️</div>
                            <div className="empty-title">Tidak ada Cold Leads untuk sales ini</div>
                            <div className="empty-desc">Pilih sales lain atau tampilkan semua data Cold Leads.</div>
                        </div>
                    ) : (
                        <div className="daily-task-list">
                            {visibleDeadlineTaskGroups.map((group) => (
                                <div key={group.salesId} className="card">
                                    <div className="lead-row-top">
                                        <div className="lead-row-name">{group.salesName}</div>
                                        <span className="badge badge-danger">{group.taskCount} leads</span>
                                    </div>

                                    <div className="daily-task-list" style={{ marginTop: 12 }}>
                                        {group.tasks.map((task) => (
                                            <div key={task.id} className="card daily-task-card">
                                                <div className="daily-task-card-top">
                                                    <div>
                                                        <div
                                                            className="daily-task-card-title"
                                                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                            onClick={() => router.push(`/leads/${task.leadId}`)}
                                                        >
                                                            {task.leadName}
                                                        </div>
                                                        <div className="daily-task-card-meta">📱 {task.leadPhone}</div>
                                                        <div className="daily-task-card-meta">📣 {task.leadSource}</div>
                                                    </div>
                                                    <div className="daily-task-card-badges">
                                                        <span className="badge badge-danger">Deadline Leads</span>
                                                        {task.salesStatus ? (
                                                            <span className={`badge ${task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'}`}>
                                                                {getSalesStatusLabel(task.salesStatus)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <div className="daily-task-card-grid">
                                                    <div className="daily-task-card-meta">Sales: {group.salesName}</div>
                                                    <div className="daily-task-card-meta">Lead age: {getTimeAgo(task.createdAt)}</div>
                                                    <div className="daily-task-card-meta">Appointment: belum ada</div>
                                                    <div className="daily-task-card-meta">Status L4: belum ada</div>
                                                    <div className="daily-task-card-meta">Masuk reminder: {formatDateTime(task.assignedAt)}</div>
                                                    <div className="daily-task-card-meta">Deadline: {formatDateTime(task.dueAt)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}
        </div>
    );
}
