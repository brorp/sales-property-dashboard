'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { apiRequest } from '../lib/api';
import './NotificationsPage.css';

function formatDateTime(dateValue, timeValue) {
    if (!dateValue) return '-';
    const safeTime = String(timeValue || '00:00').slice(0, 5);
    const parsed = new Date(`${dateValue}T${safeTime}:00`);
    if (Number.isNaN(parsed.getTime())) return `${dateValue} ${safeTime}`;
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(parsed);
}

function formatCreatedAt(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(parsed);
}

function SectionHeader({ label, title, count }) {
    return (
        <div className="notif-section-head">
            <span className="notif-section-label">{label}</span>
            <h2 className="notif-section-title">{title} <span className="notif-section-count">({count})</span></h2>
        </div>
    );
}

export default function NotificationsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const {
        holdLeads,
        newLeads,
        followUps,
        deadlineLeads,
        appointments,
        validatedHot,
        hotLeads,
        submittedTasks,
        loading,
        reload
    } = useNotifications();
    const [startingId, setStartingId] = useState('');
    const [startError, setStartError] = useState('');
    const [startSuccess, setStartSuccess] = useState('');

    const handleStartHold = async (leadId) => {
        setStartingId(leadId);
        setStartError('');
        setStartSuccess('');
        try {
            await apiRequest(`/api/distribution/leads/${leadId}/start`, { method: 'POST', user });
            setStartSuccess('Distribusi berhasil dimulai.');
            await reload(true);
        } catch (err) {
            setStartError(err instanceof Error ? err.message : 'Gagal memulai distribusi');
        } finally {
            setStartingId('');
        }
    };

    const isAdmin = user?.role === 'root_admin' || user?.role === 'client_admin';
    const isSales = user?.role === 'sales';
    const isSpv = user?.role === 'supervisor';

    let isEmpty = false;
    if (isAdmin) {
        isEmpty = holdLeads.length === 0;
    } else if (isSales) {
        isEmpty = newLeads.length === 0 && followUps.length === 0 && deadlineLeads.length === 0 && appointments.length === 0 && validatedHot.length === 0;
    } else if (isSpv) {
        isEmpty = hotLeads.length === 0 && submittedTasks.length === 0;
    }

    const refreshBtn = (
        <button
            className="app-header-back"
            onClick={() => void reload()}
            disabled={loading}
            title="Refresh"
            style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={loading ? { animation: 'notifSpin 0.7s linear infinite' } : undefined}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
            </svg>
        </button>
    );

    return (
        <div className="page-container notif-page">
            <Header title="Pengingat" showBack rightAction={refreshBtn} />

            <div className="notif-mobile-top">
                <button className="notif-mobile-back" onClick={() => router.back()} aria-label="Kembali">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <span className="notif-mobile-title">Pengingat</span>
                {refreshBtn}
            </div>

            {loading ? (
                <div className="notif-empty">
                    <div className="notif-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="spv-empty-spin">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                    </div>
                    <span className="notif-empty-title">Memuat...</span>
                </div>
            ) : isEmpty ? (
                <div className="notif-empty">
                    <div className="notif-empty-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="notif-empty-title">Tidak ada pengingat</span>
                    <span className="notif-empty-desc">Belum ada tugas atau janji temu saat ini.</span>
                </div>
            ) : (
                <>
                    {/* ── Admin Section ── */}
                    {isAdmin && holdLeads.length > 0 ? (
                        <div className="notif-section">
                            <SectionHeader label="Perlu Aksi" title="Leads Hold" count={holdLeads.length} />
                            {startError ? <p className="notif-feedback notif-feedback--error">{startError}</p> : null}
                            {startSuccess ? <p className="notif-feedback notif-feedback--success">{startSuccess}</p> : null}
                            <div className="notif-list">
                                {holdLeads.map((item) => (
                                    <div key={item.id} className="notif-card notif-card--hold">
                                        <div className="notif-card-top">
                                            <span className="notif-card-name">{item.name}</span>
                                            <span className="notif-card-badge notif-card-badge--hold">Hold</span>
                                        </div>
                                        <div className="notif-card-meta">
                                            {item.phone ? (
                                                <div className="notif-card-meta-row">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.64 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                                    </svg>
                                                    <span>{item.phone}</span>
                                                </div>
                                            ) : null}
                                            {item.source ? (
                                                <div className="notif-card-meta-row">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                    </svg>
                                                    <span>{item.source}</span>
                                                </div>
                                            ) : null}
                                            <div className="notif-card-meta-row">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span>{formatCreatedAt(item.createdAt)}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="notif-hold-start-btn"
                                            onClick={() => void handleStartHold(item.id)}
                                            disabled={startingId === item.id}
                                        >
                                            {startingId === item.id ? 'Memulai...' : (
                                                <>
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                    Mulai Distribusi
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* ── Sales Sections ── */}
                    {isSales ? (
                        <>
                            {newLeads.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Tugas Sales" title="New Leads" count={newLeads.length} />
                                    <div className="notif-list">
                                        {newLeads.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push('/daily-tasks')}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.leadName}</span>
                                                    <span className="notif-card-badge notif-card-badge--new">New Lead</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        <span>Masuk: {formatDateTime(item.assignedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {followUps.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Tugas Sales" title="Follow Up" count={followUps.length} />
                                    <div className="notif-list">
                                        {followUps.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push('/daily-tasks')}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.leadName}</span>
                                                    <span className="notif-card-badge notif-card-badge--followup">Follow Up {item.followupStage}/3</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        <span>Masuk: {formatDateTime(item.assignedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {deadlineLeads.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Tugas Sales" title="Deadline Leads" count={deadlineLeads.length} />
                                    <div className="notif-list">
                                        {deadlineLeads.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push('/daily-tasks')}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.leadName}</span>
                                                    <span className="notif-card-badge notif-card-badge--danger">Deadline</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        <span>Deadline: {formatDateTime(item.dueAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {appointments.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Janji Temu" title="Mau Survey" count={appointments.length} />
                                    <div className="notif-list">
                                        {appointments.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push(`/leads/${item.leadId}`)}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.leadName}</span>
                                                    <span className="notif-card-badge">Mau Survey</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                        <span>{formatDateTime(item.date, item.time)}</span>
                                                    </div>
                                                    {item.location ? (
                                                        <div className="notif-card-meta-row">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                                            <span>{item.location}</span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {validatedHot.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Tugas Sales" title="HOT Validated" count={validatedHot.length} />
                                    <div className="notif-list">
                                        {validatedHot.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push(`/leads/${item.id}`)}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.name}</span>
                                                    <span className="notif-card-badge notif-card-badge--success">HOT Validated</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                                                        <span>Source: {item.source || '-'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}

                    {/* ── Supervisor Sections ── */}
                    {isSpv ? (
                        <>
                            {hotLeads.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Validasi SPV" title="Hot Leads menunggu Validasi" count={hotLeads.length} />
                                    <div className="notif-list">
                                        {hotLeads.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push('/supervisor-tasks')}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.name}</span>
                                                    <span className="notif-card-badge notif-card-badge--hot">HOT</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                        <span>Sales: {item.assignedUserName || '-'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {submittedTasks.length > 0 ? (
                                <div className="notif-section">
                                    <SectionHeader label="Persetujuan SPV" title="Tugas diajukan Sales" count={submittedTasks.length} />
                                    <div className="notif-list">
                                        {submittedTasks.map((item) => (
                                            <div key={item.id} className="notif-card" onClick={() => router.push('/supervisor-tasks')}>
                                                <div className="notif-card-top">
                                                    <span className="notif-card-name">{item.leadName}</span>
                                                    <span className="notif-card-badge notif-card-badge--new">{item.label}</span>
                                                </div>
                                                <div className="notif-card-meta">
                                                    <div className="notif-card-meta-row">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                        <span>Diajukan oleh: {item.salesName || 'Sales'}</span>
                                                    </div>
                                                    {item.submittedSalesStatus ? (
                                                        <div className="notif-card-meta-row">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                            <span>Status L2: {item.submittedSalesStatus.toUpperCase()}</span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}
