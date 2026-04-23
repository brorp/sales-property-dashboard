'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';
import { getTimeAgo } from '../constants/crm';

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SupervisorTasksPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [leads, setLeads] = useState([]);
    const [submittedTaskGroups, setSubmittedTaskGroups] = useState([]);
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
            const [pendingData, submittedData] = await Promise.all([
                apiRequest('/api/supervisor-tasks', { user }),
                apiRequest('/api/supervisor-tasks/submitted-daily-tasks', { user }),
            ]);
            setLeads(Array.isArray(pendingData) ? pendingData : []);
            setSubmittedTaskGroups(Array.isArray(submittedData) ? submittedData : []);
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Gagal memuat data');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    useEffect(() => { void loadLeads(); }, [loadLeads]);

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

    return (
        <div className="page-container">
            <Header title="Supervisor Tasks" />

            <section className="dash-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                        HOT Leads — Menunggu Validasi
                    </h2>
                    <span className="badge badge-hot" style={{ fontSize: '0.82rem' }}>
                        {leads.length} pending
                    </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>
                    Lead di bawah ini telah ditandai HOT oleh sales Anda. Validasi untuk mengkonfirmasi, atau tolak untuk mengembalikan ke status Warm.
                </p>

                {error ? <div className="settings-error">{error}</div> : null}
                {actionError ? <div className="settings-error">{actionError}</div> : null}
                {actionSuccess ? <div className="settings-success">{actionSuccess}</div> : null}

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

            <section className="dash-section" style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                        Daily Task Submission 24 Jam Terakhir
                    </h2>
                    <span className="badge badge-info" style={{ fontSize: '0.82rem' }}>
                        {submittedTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)} task
                    </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>
                    Supervisor hanya melihat submission task yang sudah dikirim sales dalam 24 jam terakhir. Data lama otomatis tidak ditampilkan agar list tetap ringkas.
                </p>

                {!loading && submittedTaskGroups.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🗂️</div>
                        <div className="empty-title">Belum ada submission task terbaru</div>
                        <div className="empty-desc">Task yang sudah disubmit oleh sales akan muncul di sini selama 24 jam.</div>
                    </div>
                ) : (
                    <div className="card-list">
                        {submittedTaskGroups.map((group) => (
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
        </div>
    );
}
