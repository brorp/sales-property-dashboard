'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { uploadTaskProofImage } from '../lib/image-upload';
import { SALES_STATUSES, getSalesStatusLabel, getTimeAgo } from '../constants/crm';

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isOlderThanDays(value, days) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function getVisibleSalesStatuses(task) {
    const baseKeys = ['warm', 'hot', 'error', 'skip'];
    if (isOlderThanDays(task?.createdAt, 14)) {
        baseKeys.push('cold', 'no_response');
    }
    return SALES_STATUSES.filter((item) => baseKeys.includes(item.key));
}

function getUrgencyRank(task) {
    if (task.status === 'overdue') return 0;
    if (!task.dueAt) return 3;
    const dueAt = new Date(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) return 3;
    if (dueAt.getTime() <= Date.now()) return 0;
    const hoursLeft = (dueAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursLeft < 24) return 1;
    return 2;
}

function sortByUrgency(list) {
    return [...list].sort((a, b) => {
        const diff = getUrgencyRank(a) - getUrgencyRank(b);
        if (diff !== 0) return diff;
        if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
        return 0;
    });
}

function getTaskUrgency(task) {
    if (!task?.dueAt) return { text: 'Deadline belum tersedia', type: 'ok' };
    const dueAt = new Date(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) return { text: 'Deadline belum tersedia', type: 'ok' };
    if (task.status === 'overdue' || dueAt.getTime() <= Date.now()) {
        return { text: `Overdue sejak ${formatDateTime(task.dueAt)}`, type: 'overdue' };
    }
    const hoursLeft = (dueAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursLeft < 24) {
        return { text: `Deadline ${formatDateTime(task.dueAt)}`, type: 'warn' };
    }
    return { text: `Deadline ${formatDateTime(task.dueAt)}`, type: 'ok' };
}

function buildDefaultDraft(task) {
    return {
        salesStatus: task?.submittedSalesStatus || 'warm',
        previewUrl: '',
        screenshotUrl: '',
        uploadError: '',
        uploading: false,
        submitting: false,
    };
}

/* ── Empty state component ─────────────────────────────────────────── */

function DtEmpty({ variant = 'all_done' }) {
    const configs = {
        loading: {
            iconBg: '#EEF3F9', iconColor: '#1E3A5F',
            icon: (
                <svg className="dt-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
            ),
            title: 'Memuat data...',
            desc: '',
        },
        all_done: {
            iconBg: '#DCFCE7', iconColor: '#16A34A',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            ),
            title: 'Semua task selesai!',
            desc: 'Kamu sudah menyelesaikan semua task hari ini.',
        },
        no_followup: {
            iconBg: '#EEF3F9', iconColor: '#1E3A5F',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
            ),
            title: 'Tidak ada Follow Up task',
            desc: 'Semua follow up sudah selesai atau belum masuk milestone.',
        },
        no_deadline: {
            iconBg: '#FEF9C3', iconColor: '#854D0E',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            ),
            title: 'Tidak ada Deadline Leads',
            desc: 'Lead warm hari ke-14 tanpa appointment akan muncul di sini.',
        },
        no_appointment: {
            iconBg: '#DCFCE7', iconColor: '#16A34A',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h.01M12 14h.01M16 14h.01" />
                </svg>
            ),
            title: 'Tidak ada appointment aktif',
            desc: 'Appointment dengan status Mau Survey akan muncul di sini.',
        },
        no_search: {
            iconBg: '#F5F3FF', iconColor: '#7C3AED',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            ),
            title: 'Tidak ditemukan',
            desc: 'Coba kata kunci yang berbeda.',
        },
        no_hot: {
            iconBg: '#FEE2E2', iconColor: '#DC2626',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
            ),
            title: 'Belum ada HOT Validated',
            desc: 'Lead HOT yang divalidasi supervisor akan muncul di sini.',
        },
    };
    const c = configs[variant] || configs.all_done;
    return (
        <div className="dt-empty">
            <div className="dt-empty-icon" style={{ background: c.iconBg, color: c.iconColor }}>
                {c.icon}
            </div>
            <div className="dt-empty-title">{c.title}</div>
            {c.desc ? <div className="dt-empty-desc">{c.desc}</div> : null}
        </div>
    );
}

/* ── Meta icon helpers ─────────────────────────────────────────────── */

const IC = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function IcPin() { return <svg {...IC}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function IcClock() { return <svg {...IC}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>; }
function IcCalendar() { return <svg {...IC}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>; }
function IcUser() { return <svg {...IC}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function IcUpload() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>; }
function IcAlert() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>; }
function IcCheck() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }

/* ── Main component ────────────────────────────────────────────────── */

export default function DailyTaskPage() {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('new_leads');
    const [tasks, setTasks] = useState({
        newLeads: [],
        followUps: [],
        deadlineLeads: [],
        counts: { totalCount: 0, newLeadCount: 0, followUpCount: 0, deadlineLeadCount: 0 },
    });
    const [drafts, setDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [validatedHot, setValidatedHot] = useState([]);
    const [sideLoading, setSideLoading] = useState(false);
    const [nameSearch, setNameSearch] = useState('');

    const mergeDraft = useCallback((taskId, partial) => {
        setDrafts((prev) => ({
            ...prev,
            [taskId]: { ...(prev[taskId] || {}), ...partial },
        }));
    }, []);

    const loadTasks = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) { setLoading(true); setError(''); }
        try {
            const data = await apiRequest('/api/daily-tasks', { user });
            const normalized = {
                newLeads: Array.isArray(data?.newLeads) ? data.newLeads : [],
                followUps: Array.isArray(data?.followUps) ? data.followUps : [],
                deadlineLeads: Array.isArray(data?.deadlineLeads) ? data.deadlineLeads : [],
                counts: {
                    totalCount: Number(data?.counts?.totalCount || 0),
                    newLeadCount: Number(data?.counts?.newLeadCount || 0),
                    followUpCount: Number(data?.counts?.followUpCount || 0),
                    deadlineLeadCount: Number(data?.counts?.deadlineLeadCount || 0),
                },
            };
            setTasks(normalized);
            setDrafts((prev) => {
                const next = { ...prev };
                [...normalized.newLeads, ...normalized.followUps, ...normalized.deadlineLeads].forEach((task) => {
                    next[task.id] = { ...buildDefaultDraft(task), ...(prev[task.id] || {}) };
                });
                return next;
            });
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Gagal memuat Daily Task');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    const loadSideData = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) setSideLoading(true);
        try {
            const [apptData, hotData] = await Promise.all([
                apiRequest('/api/appointments', { user }),
                apiRequest('/api/supervisor-tasks/validated-hot', { user }),
            ]);
            const activeAppts = Array.isArray(apptData)
                ? apptData.filter((a) => a.status === 'mau_survey' && a.salesId === user.id)
                : [];
            setAppointments(activeAppts);
            setValidatedHot(Array.isArray(hotData) ? hotData : []);
        } catch {
            // non-critical
        } finally {
            if (!silent) setSideLoading(false);
        }
    }, [user]);

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    useEffect(() => {
        void loadTasks();
        void loadSideData();
    }, [loadTasks, loadSideData]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            const hasBusyDraft = Object.values(drafts).some((item) => item?.uploading || item?.submitting);
            if (hasBusyDraft) return;
            await loadTasks({ silent: true });
            await loadSideData({ silent: true });
        },
    });

    const rawTasks = activeTab === 'new_leads' ? tasks.newLeads
        : activeTab === 'follow_ups' ? tasks.followUps
        : tasks.deadlineLeads;

    const visibleTasks = sortByUrgency(
        nameSearch.trim()
            ? rawTasks.filter((t) => t.leadName?.toLowerCase().includes(nameSearch.toLowerCase()))
            : rawTasks
    );

    const handleUploadProof = async (task, file) => {
        if (!file || !user) return;
        mergeDraft(task.id, { uploadError: '', uploading: true });
        try {
            const uploaded = await uploadTaskProofImage(file, user);
            mergeDraft(task.id, { previewUrl: uploaded.dataUrl, screenshotUrl: uploaded.url, uploading: false });
        } catch (err) {
            mergeDraft(task.id, { uploading: false, uploadError: err instanceof Error ? err.message : 'Gagal upload screenshot' });
        }
    };

    const handleSubmitTask = async (task, endpoint, body = {}) => {
        if (!user) return;
        const draft = drafts[task.id] || buildDefaultDraft(task);
        if (!draft.screenshotUrl) {
            mergeDraft(task.id, { uploadError: 'Upload screenshot proof terlebih dahulu.' });
            return;
        }
        mergeDraft(task.id, { submitting: true, uploadError: '' });
        setError(''); setSuccess('');
        try {
            await apiRequest(endpoint, { method: 'POST', user, body: { screenshotUrl: draft.screenshotUrl, ...body } });
            setSuccess(`${task.label} berhasil disubmit.`);
            setDrafts((prev) => { const next = { ...prev }; delete next[task.id]; return next; });
            await loadTasks({ silent: true });
        } catch (err) {
            mergeDraft(task.id, { submitting: false });
            setError(err instanceof Error ? err.message : 'Gagal submit task');
            return;
        }
        mergeDraft(task.id, { submitting: false });
    };

    const handleSubmitNewLead = async (task) => {
        const draft = drafts[task.id] || buildDefaultDraft(task);
        if (!draft.salesStatus) { setError('Status L2 wajib dipilih sebelum submit.'); return; }
        await handleSubmitTask(task, `/api/daily-tasks/${task.id}/submit-new-lead`, { salesStatus: draft.salesStatus });
    };

    const handleSubmitFollowUp = async (task) => {
        await handleSubmitTask(task, `/api/daily-tasks/${task.id}/submit-follow-up`);
    };

    const handleDeadlineLeadAction = async (task, action) => {
        if (!user) return;
        mergeDraft(task.id, { submitting: true, uploadError: '' });
        setError(''); setSuccess('');
        try {
            await apiRequest(`/api/daily-tasks/${task.id}/submit-deadline-lead`, { method: 'POST', user, body: { action } });
            setSuccess(action === 'change_to_cold'
                ? `${task.leadName} berhasil diubah ke Cold.`
                : `${task.leadName} dihapus dari Deadline Leads.`);
            setDrafts((prev) => { const next = { ...prev }; delete next[task.id]; return next; });
            await loadTasks({ silent: true });
        } catch (err) {
            mergeDraft(task.id, { submitting: false });
            setError(err instanceof Error ? err.message : 'Gagal submit Deadline Leads');
            return;
        }
        mergeDraft(task.id, { submitting: false });
    };

    return (
        <div className="page-container daily-task-page">
            <Header title="Daily Task" mobileTitle={activeWorkspace?.name || 'Daily Task'} hasTabs />

            {/* ── Tab bar ──────────────────────────────────────────── */}
            <div className="daily-task-tabs">
                <button type="button" className={`daily-task-tab${activeTab === 'new_leads' ? ' is-active' : ''}`} onClick={() => { setActiveTab('new_leads'); setNameSearch(''); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.newLeadCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.newLeadCount}</span>
                    </span>
                    <span className="daily-task-tab-label">New Leads</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'follow_ups' ? ' is-active' : ''}`} onClick={() => { setActiveTab('follow_ups'); setNameSearch(''); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.followUpCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.followUpCount}</span>
                    </span>
                    <span className="daily-task-tab-label">Follow Up</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'deadline_leads' ? ' is-active' : ''}`} onClick={() => { setActiveTab('deadline_leads'); setNameSearch(''); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.deadlineLeadCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.deadlineLeadCount}</span>
                    </span>
                    <span className="daily-task-tab-label">Deadline</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'appointments' ? ' is-active' : ''}`} onClick={() => { setActiveTab('appointments'); setNameSearch(''); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
                        <span className="daily-task-tab-badge" style={appointments.length === 0 ? { visibility: 'hidden' } : undefined}>{appointments.length}</span>
                    </span>
                    <span className="daily-task-tab-label">Appointment</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'hot_validated' ? ' is-active' : ''}`} onClick={() => { setActiveTab('hot_validated'); setNameSearch(''); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                        <span className="daily-task-tab-badge" style={validatedHot.length === 0 ? { visibility: 'hidden' } : undefined}>{validatedHot.length}</span>
                    </span>
                    <span className="daily-task-tab-label">HOT</span>
                </button>
            </div>

            <div className="dt-tab-spacer" />

            {error ? <div className="settings-error">{error}</div> : null}
            {success ? <div className="settings-success">{success}</div> : null}

            {/* ── Search bar ───────────────────────────────────────── */}
            {(activeTab === 'new_leads' || activeTab === 'follow_ups' || activeTab === 'deadline_leads' || activeTab === 'appointments' || activeTab === 'hot_validated') ? (
                <div className="dt-search-wrap">
                    <svg className="dt-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className="dt-search-input"
                        placeholder="Cari nama lead..."
                        value={nameSearch}
                        onChange={(e) => setNameSearch(e.target.value)}
                    />
                    {nameSearch ? (
                        <button type="button" className="dt-search-clear" onClick={() => setNameSearch('')}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    ) : null}
                </div>
            ) : null}

            {/* ── New Leads / Follow Up ─────────────────────────────── */}
            {(activeTab === 'new_leads' || activeTab === 'follow_ups') ? (
                <>
                    {loading ? <DtEmpty variant="loading" /> : null}

                    {!loading && visibleTasks.length === 0 ? (
                        <DtEmpty variant={nameSearch ? 'no_search' : activeTab === 'new_leads' ? 'all_done' : 'no_followup'} />
                    ) : null}

                    {!loading && visibleTasks.length > 0 ? (
                        <div className="dt-task-grid">
                            {visibleTasks.map((task) => {
                                const draft = drafts[task.id] || buildDefaultDraft(task);
                                const visibleStatuses = getVisibleSalesStatuses(task);
                                const urgency = getTaskUrgency(task);
                                const cardClass = task.status === 'overdue'
                                    ? 'dt-card-overdue'
                                    : task.taskType === 'follow_up' ? 'dt-card-followup' : 'dt-card-new';

                                return (
                                    <div key={task.id} className={`dt-card ${cardClass}`}>
                                        {/* header */}
                                        <div className="dt-card-header">
                                            <div className="dt-card-name-wrap">
                                                <div className="dt-card-name">{task.leadName}</div>
                                                <div className="dt-card-phone">{task.leadPhone}</div>
                                            </div>
                                            <div className="dt-card-badges">
                                                <span className={`badge ${task.status === 'overdue' ? 'badge-danger' : task.taskType === 'follow_up' ? 'badge-purple' : 'badge-info'}`}>
                                                    {task.status === 'overdue' ? 'Overdue' : task.label}
                                                </span>
                                                {task.taskType === 'follow_up'
                                                    ? <span className="badge badge-neutral">{task.followupStage}/3</span>
                                                    : null}
                                            </div>
                                        </div>

                                        {/* meta */}
                                        <div className="dt-meta-grid">
                                            {task.leadSource ? (
                                                <div className="dt-meta-item"><IcPin /><span>{task.leadSource}</span></div>
                                            ) : null}
                                            <div className="dt-meta-item"><IcUser /><span>Lead age: {getTimeAgo(task.createdAt)}</span></div>
                                            <div className="dt-meta-item"><IcCalendar /><span>Masuk: {formatDateTime(task.assignedAt)}</span></div>
                                            {task.acceptedAt
                                                ? <div className="dt-meta-item"><IcCheck /><span>Accepted: {formatDateTime(task.acceptedAt)}</span></div>
                                                : null}
                                        </div>

                                        {/* urgency */}
                                        <div className={`dt-urgency${urgency.type === 'overdue' ? ' dt-urgency-overdue' : urgency.type === 'ok' ? ' dt-urgency-ok' : ''}`}>
                                            <IcAlert />
                                            {urgency.text}
                                        </div>

                                        {/* status select or followup hint */}
                                        {task.taskType === 'new_lead' ? (
                                            <div className="dt-status-wrap">
                                                <span className="dt-status-label">Status L2</span>
                                                <select
                                                    className="input-field"
                                                    value={draft.salesStatus || 'warm'}
                                                    onChange={(e) => mergeDraft(task.id, { salesStatus: e.target.value })}
                                                    disabled={draft.submitting}
                                                >
                                                    {visibleStatuses.map((item) => (
                                                        <option key={item.key} value={item.key}>
                                                            {getSalesStatusLabel(item.key)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            <div className="dt-followup-hint">
                                                Submit screenshot proof untuk milestone <strong>{task.followupStage}/3</strong>
                                            </div>
                                        )}

                                        {/* upload */}
                                        <div className="dt-upload-section">
                                            <label className={`dt-upload-btn${draft.screenshotUrl ? ' has-file' : ''}`}>
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                                    hidden
                                                    onChange={(e) => void handleUploadProof(task, e.target.files?.[0] || null)}
                                                />
                                                <IcUpload />
                                                {draft.uploading ? 'Uploading...' : draft.screenshotUrl ? 'Ganti Screenshot' : 'Upload Screenshot'}
                                            </label>
                                            {draft.previewUrl
                                                ? <img src={draft.previewUrl} alt="Preview proof" className="dt-preview-img" />
                                                : null}
                                        </div>

                                        {draft.uploadError
                                            ? <div className="settings-error" style={{ marginBottom: 0 }}>{draft.uploadError}</div>
                                            : null}

                                        {/* submit */}
                                        <div className="dt-actions">
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                disabled={draft.uploading || draft.submitting}
                                                onClick={() => void (task.taskType === 'new_lead' ? handleSubmitNewLead(task) : handleSubmitFollowUp(task))}
                                            >
                                                {draft.submitting ? 'Submitting...' : 'Submit Task'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </>
            ) : null}

            {/* ── Deadline Leads ────────────────────────────────────── */}
            {activeTab === 'deadline_leads' ? (
                <>
                    {loading ? <DtEmpty variant="loading" /> : null}

                    {!loading && visibleTasks.length === 0 ? (
                        <DtEmpty variant={nameSearch ? 'no_search' : 'no_deadline'} />
                    ) : null}

                    {!loading && visibleTasks.length > 0 ? (
                        <div className="dt-task-grid">
                            {visibleTasks.map((task) => {
                                const draft = drafts[task.id] || buildDefaultDraft(task);
                                return (
                                    <div key={task.id} className="dt-card dt-card-deadline">
                                        <div className="dt-card-header">
                                            <div className="dt-card-name-wrap">
                                                <div className="dt-card-name">{task.leadName}</div>
                                                <div className="dt-card-phone">{task.leadPhone}</div>
                                            </div>
                                            <div className="dt-card-badges">
                                                <span className="badge badge-danger">Deadline</span>
                                                {task.salesStatus ? (
                                                    <span className={`badge ${task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'}`}>
                                                        {getSalesStatusLabel(task.salesStatus)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="dt-meta-grid">
                                            {task.leadSource ? <div className="dt-meta-item"><IcPin /><span>{task.leadSource}</span></div> : null}
                                            <div className="dt-meta-item"><IcUser /><span>Lead age: {getTimeAgo(task.createdAt)}</span></div>
                                            <div className="dt-meta-item"><IcCalendar /><span>Masuk: {formatDateTime(task.assignedAt)}</span></div>
                                            <div className="dt-meta-item"><IcClock /><span>Appointment: belum ada</span></div>
                                        </div>

                                        <div className="dt-followup-hint">
                                            Tentukan apakah lead ini perlu diubah ke Cold atau tetap dipertahankan.
                                        </div>

                                        <div className="dt-deadline-actions">
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                disabled={draft.submitting}
                                                onClick={() => void handleDeadlineLeadAction(task, 'change_to_cold')}
                                            >
                                                {draft.submitting ? 'Submitting...' : 'Change to Cold'}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={draft.submitting}
                                                onClick={() => void handleDeadlineLeadAction(task, 'stay')}
                                            >
                                                Stay Warm
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </>
            ) : null}

            {/* ── Appointment ───────────────────────────────────────── */}
            {activeTab === 'appointments' ? (
                <>
                    {sideLoading ? <DtEmpty variant="loading" /> : null}
                    {!sideLoading && appointments.length === 0 ? <DtEmpty variant="no_appointment" /> : null}
                    {!sideLoading && appointments.length > 0 ? (() => {
                        const filtered = nameSearch.trim()
                            ? appointments.filter((a) => a.leadName?.toLowerCase().includes(nameSearch.toLowerCase()))
                            : appointments;
                        if (filtered.length === 0) return <DtEmpty variant="no_search" />;
                        return (
                            <div className="dt-task-grid">
                                {filtered.map((appt) => (
                                    <div
                                        key={appt.id}
                                        className="dt-card dt-card-appt"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => router.push(`/leads/${appt.leadId}`)}
                                    >
                                        <div className="dt-card-header">
                                            <div className="dt-card-name-wrap">
                                                <div className="dt-card-name">{appt.leadName}</div>
                                                <div className="dt-card-phone">{appt.leadPhone}</div>
                                            </div>
                                            <span className="badge badge-hot">Mau Survey</span>
                                        </div>
                                        <div className="dt-meta-grid">
                                            <div className="dt-meta-item"><IcCalendar /><span>{appt.date} · {appt.time}</span></div>
                                            <div className="dt-meta-item"><IcPin /><span>{appt.location}</span></div>
                                            {appt.notes ? <div className="dt-meta-item"><IcClock /><span>{appt.notes}</span></div> : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })() : null}
                </>
            ) : null}

            {/* ── HOT Validated ─────────────────────────────────────── */}
            {activeTab === 'hot_validated' ? (
                <>
                    {sideLoading ? <DtEmpty variant="loading" /> : null}
                    {!sideLoading && validatedHot.length === 0 ? <DtEmpty variant="no_hot" /> : null}
                    {!sideLoading && validatedHot.length > 0 ? (() => {
                        const filtered = nameSearch.trim()
                            ? validatedHot.filter((l) => l.name?.toLowerCase().includes(nameSearch.toLowerCase()))
                            : validatedHot;
                        if (filtered.length === 0) return <DtEmpty variant="no_search" />;
                        return (
                            <div className="dt-task-grid">
                                {filtered.map((lead) => (
                                    <div
                                        key={lead.id}
                                        className="dt-card dt-card-hot"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => router.push(`/leads/${lead.id}`)}
                                    >
                                        <div className="dt-card-header">
                                            <div className="dt-card-name-wrap">
                                                <div className="dt-card-name">{lead.name}</div>
                                                <div className="dt-card-phone">{lead.phone}</div>
                                            </div>
                                            <div className="dt-card-badges">
                                                <span className="badge badge-hot">HOT</span>
                                                <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>✓ Validated</span>
                                            </div>
                                        </div>
                                        <div className="dt-meta-grid">
                                            {lead.source ? <div className="dt-meta-item"><IcPin /><span>{lead.source}</span></div> : null}
                                            <div className="dt-meta-item"><IcClock /><span>Update {getTimeAgo(lead.updatedAt)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })() : null}
                </>
            ) : null}
        </div>
    );
}
