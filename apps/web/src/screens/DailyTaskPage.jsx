'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import Button from '../components/Button';
import DatePicker from '../components/DatePicker';
import SelectFilter from '../components/SelectFilter';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import VerifiedIcon from '../components/VerifiedIcon';
import { useWorkspace } from '../context/WorkspaceContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { uploadTaskProofImage } from '../lib/image-upload';
import { SALES_STATUSES, getSalesStatusLabel, getTimeAgo, toWaLink } from '../constants/crm';

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const dateStr = date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${dateStr} · ${hours}:${minutes}`;
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
        salesStatus: task?.submittedSalesStatus || '',
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
            title: 'Tidak ada janji temu aktif',
            desc: 'Janji temu dengan status Mau Survey akan muncul di sini.',
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
function IcNotes() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>; }

function getAppointmentGroup(appt) {
    if (!appt.date) return 'nanti';
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const parts = appt.date.split('-').map(Number);
    if (parts.length !== 3) return 'nanti';
    const apptTime = new Date(parts[0], parts[1] - 1, parts[2]).getTime();

    if (apptTime < todayStart) return 'terlewat';
    if (apptTime === todayStart) return 'hari_ini';
    return 'nanti';
}

function isOlderThan30Days(val) {
    if (!val) return false;
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return false;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - date.getTime() > thirtyDaysMs;
}

/* ── Main component ────────────────────────────────────────────────── */

export default function DailyTaskPage() {
    const { user } = useAuth();
    const { leads } = useLeads();
    const { activeWorkspace } = useWorkspace();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('dt_active_tab') || 'new_leads';
        }
        return 'new_leads';
    });
    const [apptSubTab, setApptSubTab] = useState('semua');
    const [hotSubTab, setHotSubTab] = useState('semua');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('dt_active_tab', activeTab);
        }
    }, [activeTab]);
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
    const [reschedulingApptId, setReschedulingApptId] = useState(null);
    const [rescheduleValue, setRescheduleValue] = useState('');

    const normalizeLeadCardData = (raw, type) => {
        const leadId = type === 'hot' ? raw.id : raw.leadId;
        const leadDetail = (Array.isArray(leads) ? leads : []).find((l) => l.id === leadId) || null;

        if (type === 'appt') {
            return {
                leadSource: leadDetail?.source || raw.leadSource,
                createdAt: leadDetail?.createdAt || raw.leadCreatedAt,
                assignedAt: raw.createdAt,
                latestAppointment: {
                    date: raw.date,
                    time: raw.time,
                    location: raw.location,
                    status: raw.status,
                    notes: raw.notes,
                },
                manualNote: leadDetail?.manualNote || raw.leadManualNote,
            };
        }
        if (type === 'hot') {
            return {
                leadSource: leadDetail?.source || raw.source,
                createdAt: leadDetail?.createdAt || raw.createdAt,
                assignedAt: raw.updatedAt,
                latestAppointment: leadDetail?.latestAppointment || raw.latestAppointment,
                manualNote: leadDetail?.manualNote || raw.manualNote,
            };
        }
        return {
            leadSource: leadDetail?.source || raw.leadSource,
            createdAt: leadDetail?.createdAt || raw.createdAt,
            assignedAt: raw.assignedAt,
            latestAppointment: leadDetail?.latestAppointment || raw.latestAppointment,
            manualNote: leadDetail?.manualNote || raw.manualNote,
        };
    };

    const renderDisplayLeadCardInfo = (cardData) => {
        const {
            leadSource,
            createdAt,
            assignedAt,
            latestAppointment,
            manualNote,
        } = cardData;

        const formattedAppt = () => {
            if (!latestAppointment || !latestAppointment.date) return 'belum ada';
            const parts = latestAppointment.date.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const date = new Date(year, month, day);
                const dateStr = date.toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                });
                return `${dateStr} · ${latestAppointment.time || '00:00'}`;
            }
            return `${latestAppointment.date} · ${latestAppointment.time || '00:00'}`;
        };

        return (
            <div className="dt-meta-grid">
                <div className="dt-meta-item" title="Sumber Lead">
                    <IcPin />
                    <span>{leadSource || 'Manual Input'}</span>
                </div>
                <div className="dt-meta-item" title="Umur Lead">
                    <IcUser />
                    <span>Lead age: {getTimeAgo(createdAt)}</span>
                </div>
                <div className="dt-meta-item" title="Waktu Masuk Tugas Harian">
                    <IcCalendar />
                    <span>Masuk: {formatDateTime(assignedAt)}</span>
                </div>
                <div className="dt-meta-item" title="Janji Temu / Survey">
                    <IcClock />
                    <span>Janji Temu: {formattedAppt()}</span>
                </div>
                <div className="dt-meta-item dt-meta-item-notes" title="Catatan Lead" style={{ gridColumn: '1 / -1' }}>
                    <IcNotes />
                    <span className="dt-meta-notes-text">{manualNote ? `Catatan: ${manualNote}` : 'Catatan: belum ada'}</span>
                </div>
            </div>
        );
    };

    const renderCardHeader = (name, phone, badges, isVerified = false) => {
        return (
            <div className="dt-card-header">
                <div className="dt-card-name-wrap">
                    <div className="dt-card-name-row">
                        <span className="dt-card-name">{name}</span>
                        {isVerified && <VerifiedIcon size={14} className="lc-verified-badge" />}
                    </div>
                    <div className="dt-card-phone">{phone}</div>
                </div>
                <div className="dt-card-badges">
                    {badges.map((b, idx) => (
                        <span key={idx} className={`badge ${b.className || 'badge-neutral'}`}>
                            {b.label}
                        </span>
                    ))}
                </div>
            </div>
        );
    };

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
        if (!draft.salesStatus) { setError('Status Prospek wajib dipilih sebelum submit.'); return; }
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

    const handleUpdateAppointmentStatus = async (appt, status) => {
        try {
            setError('');
            setSuccess('');
            await apiRequest(`/api/appointments/${appt.id}`, {
                method: 'PATCH',
                user,
                body: { status }
            });
            setSuccess(
                status === 'sudah_survey'
                    ? `Janji temu dengan ${appt.leadName} ditandai Sudah Survey.`
                    : `Janji temu dengan ${appt.leadName} dibatalkan.`
            );
            await loadSideData({ silent: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memperbarui janji temu');
        }
    };

    const handleStartReschedule = (e, appt) => {
        e.stopPropagation();
        setReschedulingApptId(appt.id);
        const defaultVal = appt.date ? `${appt.date}T${appt.time || '12:00'}` : '';
        setRescheduleValue(defaultVal);
    };

    const handleSaveReschedule = async (appt) => {
        if (!rescheduleValue) return;
        const [datePart, timePart] = rescheduleValue.split('T');
        try {
            setError('');
            setSuccess('');
            await apiRequest(`/api/appointments/${appt.id}`, {
                method: 'PATCH',
                user,
                body: {
                    date: datePart,
                    time: timePart || '12:00'
                }
            });
            setSuccess(`Janji temu dengan ${appt.leadName} berhasil dijadwal ulang.`);
            setReschedulingApptId(null);
            await loadSideData({ silent: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal mengubah jadwal janji temu');
        }
    };

    return (
        <div className="page-container daily-task-page">
            <Header title="Tugas Harian" mobileTitle={activeWorkspace?.name || 'Tugas Harian'} hasTabs />

            <div className="dt-mobile-top">
                <span className="dt-mobile-title">{activeWorkspace?.name || 'Tugas Harian'}</span>
                <button
                    className="dt-mobile-refresh"
                    onClick={() => { void loadTasks(); void loadSideData(); }}
                    disabled={loading}
                    title="Refresh"
                    style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={loading ? { animation: 'dtSpin 0.7s linear infinite' } : undefined}>
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                </button>
            </div>

            {/* ── Tab bar ──────────────────────────────────────────── */}
            <div className="daily-task-tabs">
                <button type="button" className={`daily-task-tab${activeTab === 'new_leads' ? ' is-active' : ''}`} onClick={() => { setActiveTab('new_leads'); setNameSearch(''); setApptSubTab('semua'); setHotSubTab('semua'); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.newLeadCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.newLeadCount}</span>
                    </span>
                    <span className="daily-task-tab-label">New Leads</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'follow_ups' ? ' is-active' : ''}`} onClick={() => { setActiveTab('follow_ups'); setNameSearch(''); setApptSubTab('semua'); setHotSubTab('semua'); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.followUpCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.followUpCount}</span>
                    </span>
                    <span className="daily-task-tab-label">Follow Up</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'deadline_leads' ? ' is-active' : ''}`} onClick={() => { setActiveTab('deadline_leads'); setNameSearch(''); setApptSubTab('semua'); setHotSubTab('semua'); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span className="daily-task-tab-badge" style={tasks.counts.deadlineLeadCount === 0 ? { visibility: 'hidden' } : undefined}>{tasks.counts.deadlineLeadCount}</span>
                    </span>
                    <span className="daily-task-tab-label">Deadline</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'appointments' ? ' is-active' : ''}`} onClick={() => { setActiveTab('appointments'); setNameSearch(''); setApptSubTab('semua'); setHotSubTab('semua'); }}>
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
                        <span className="daily-task-tab-badge" style={appointments.length === 0 ? { visibility: 'hidden' } : undefined}>{appointments.length}</span>
                    </span>
                    <span className="daily-task-tab-label">Janji Temu</span>
                </button>
                <button type="button" className={`daily-task-tab${activeTab === 'hot_validated' ? ' is-active' : ''}`} onClick={() => { setActiveTab('hot_validated'); setNameSearch(''); setApptSubTab('semua'); setHotSubTab('semua'); }}>
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
                                const cardClass = task.status === 'overdue'
                                    ? 'dt-card-overdue'
                                    : task.taskType === 'follow_up' ? 'dt-card-followup' : 'dt-card-new';
                                const badges = [
                                    {
                                        label: task.status === 'overdue' ? 'Overdue' : task.label,
                                        className: task.status === 'overdue' ? 'badge-danger' : task.taskType === 'follow_up' ? 'badge-purple' : 'badge-info'
                                    }
                                ];
                                if (task.taskType === 'follow_up') {
                                    badges.push({ label: `${task.followupStage}/3`, className: 'badge-neutral' });
                                }
                                if (task.salesStatus) {
                                    badges.push({
                                        label: getSalesStatusLabel(task.salesStatus),
                                        className: task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'
                                    });
                                }
                                const leadDetail = (Array.isArray(leads) ? leads : []).find((l) => l.id === task.leadId);
                                if (leadDetail && leadDetail.customerPipelineTotalSteps > 0) {
                                    badges.push({
                                        label: `FU ${leadDetail.customerPipelineCompletedCount}/${leadDetail.customerPipelineTotalSteps}`,
                                        className: 'badge-purple'
                                    });
                                }

                                return (
                                    <div
                                        key={task.id}
                                        className={`dt-card ${cardClass}`}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => router.push(`/leads/${task.leadId}`)}
                                    >
                                        {/* header */}
                                        {renderCardHeader(task.leadName, task.leadPhone, badges, false)}

                                        {/* meta */}
                                        {renderDisplayLeadCardInfo(normalizeLeadCardData(task, 'task'))}

                                        {/* status select or followup hint */}
                                        {task.taskType === 'new_lead' ? (
                                            <div className="dt-status-wrap">
                                                <span className="dt-status-label">Status Prospek</span>
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <SelectFilter
                                                        options={visibleStatuses.map((item) => ({ value: item.key, label: getSalesStatusLabel(item.key) }))}
                                                        value={draft.salesStatus || ''}
                                                        onChange={(val) => { if (val) mergeDraft(task.id, { salesStatus: val }); }}
                                                        placeholder="Pilih Status..."
                                                        clearable={false}
                                                        disabled={draft.submitting}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="dt-followup-hint" onClick={(e) => e.stopPropagation()}>
                                                Submit screenshot proof untuk milestone <strong>{task.followupStage}/3</strong>
                                            </div>
                                        )}

                                        {/* upload */}
                                        <div className="dt-upload-section" onClick={(e) => e.stopPropagation()}>
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
                                                ? <img src={draft.previewUrl} alt="Preview proof" className="dt-preview-img" onClick={(e) => e.stopPropagation()} />
                                                : null}
                                        </div>

                                        {draft.uploadError
                                            ? <div className="settings-error" style={{ marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>{draft.uploadError}</div>
                                            : null}

                                        {/* submit */}
                                        <div className="dt-actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '12px' }}>
                                            <a
                                                href={toWaLink(task.leadPhone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-whatsapp"
                                                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                Chat WhatsApp
                                            </a>
                                            <Button
                                                variant="primary"
                                                loading={draft.submitting}
                                                loadingText="Submitting..."
                                                disabled={draft.uploading}
                                                onClick={() => void (task.taskType === 'new_lead' ? handleSubmitNewLead(task) : handleSubmitFollowUp(task))}
                                                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem' }}
                                            >
                                                Submit Task
                                            </Button>
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
                                const badges = [
                                    { label: 'Deadline', className: 'badge-danger' }
                                ];
                                if (task.salesStatus) {
                                    badges.push({
                                        label: getSalesStatusLabel(task.salesStatus),
                                        className: task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'
                                    });
                                }
                                const leadDetail = (Array.isArray(leads) ? leads : []).find((l) => l.id === task.leadId);
                                if (leadDetail && leadDetail.customerPipelineTotalSteps > 0) {
                                    badges.push({
                                        label: `FU ${leadDetail.customerPipelineCompletedCount}/${leadDetail.customerPipelineTotalSteps}`,
                                        className: 'badge-purple'
                                    });
                                }

                                return (
                                    <div
                                        key={task.id}
                                        className="dt-card dt-card-deadline"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => router.push(`/leads/${task.leadId}`)}
                                    >
                                        {/* header */}
                                        {renderCardHeader(task.leadName, task.leadPhone, badges, false)}

                                        {/* meta */}
                                        {renderDisplayLeadCardInfo(normalizeLeadCardData(task, 'task'))}

                                        <div className="dt-followup-hint" onClick={(e) => e.stopPropagation()}>
                                            Tentukan apakah lead ini perlu diubah ke Cold atau tetap dipertahankan.
                                        </div>

                                        <div className="dt-deadline-actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '12px' }}>
                                            <a
                                                href={toWaLink(task.leadPhone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-whatsapp"
                                                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                Chat WhatsApp
                                            </a>
                                            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                <Button
                                                    variant="danger"
                                                    style={{ flex: 1, height: '40px', padding: '0 12px', fontSize: '0.875rem' }}
                                                    loading={draft.submitting}
                                                    loadingText="Submitting..."
                                                    onClick={() => void handleDeadlineLeadAction(task, 'change_to_cold')}
                                                >
                                                    Change to Cold
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    style={{ flex: 1, height: '40px', padding: '0 12px', fontSize: '0.875rem' }}
                                                    loading={draft.submitting}
                                                    loadingText="Submitting..."
                                                    onClick={() => void handleDeadlineLeadAction(task, 'stay')}
                                                >
                                                    Stay Warm
                                                </Button>
                                            </div>
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

                        const grouped = {
                            terlewat: [],
                            hari_ini: [],
                            nanti: []
                        };
                        filtered.forEach((appt) => {
                            const group = getAppointmentGroup(appt);
                            grouped[group].push(appt);
                        });

                        const renderApptCard = (appt) => {
                            const badges = [
                                { label: 'Mau Survey', className: 'badge-hot' }
                            ];
                            const leadDetail = (Array.isArray(leads) ? leads : []).find((l) => l.id === appt.leadId);
                            const salesStatus = leadDetail?.salesStatus || appt.leadSalesStatus;
                            if (salesStatus) {
                                badges.push({
                                    label: getSalesStatusLabel(salesStatus),
                                    className: salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'
                                });
                            }
                            if (leadDetail && leadDetail.customerPipelineTotalSteps > 0) {
                                badges.push({
                                    label: `FU ${leadDetail.customerPipelineCompletedCount}/${leadDetail.customerPipelineTotalSteps}`,
                                    className: 'badge-purple'
                                });
                            }

                            return (
                                <div
                                    key={appt.id}
                                    className="dt-card dt-card-appt"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => router.push(`/leads/${appt.leadId}`)}
                                >
                                    {/* header */}
                                    {renderCardHeader(appt.leadName, appt.leadPhone, badges, false)}

                                    {/* meta */}
                                    {renderDisplayLeadCardInfo(normalizeLeadCardData(appt, 'appt'))}
                                
                                    {reschedulingApptId === appt.id ? (
                                        <div className="dt-reschedule-form" onClick={(e) => e.stopPropagation()}>
                                            <DatePicker
                                                value={rescheduleValue}
                                                onChange={setRescheduleValue}
                                                showTime={true}
                                                placeholder="Pilih tanggal & waktu"
                                            />
                                            <div className="dt-reschedule-actions">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => void handleSaveReschedule(appt)}
                                                    disabled={!rescheduleValue}
                                                >
                                                    Simpan
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={(e) => { e.stopPropagation(); setReschedulingApptId(null); }}
                                                >
                                                    Batal
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="dt-appt-actions-wrap" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '8px' }}>
                                            <a
                                                href={toWaLink(appt.leadPhone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-whatsapp"
                                                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                Chat WhatsApp
                                            </a>
                                            <div className="dt-appt-actions">
                                                <button
                                                    type="button"
                                                    className="dt-btn-action btn-sudah-survey"
                                                    onClick={(e) => { e.stopPropagation(); void handleUpdateAppointmentStatus(appt, 'sudah_survey'); }}
                                                >
                                                    Sudah Survey
                                                </button>
                                                <div className="dt-appt-actions-row">
                                                    <button
                                                        type="button"
                                                        className="dt-btn-action btn-reschedule"
                                                        onClick={(e) => handleStartReschedule(e, appt)}
                                                    >
                                                        Reschedule
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="dt-btn-action btn-batal-survey"
                                                        onClick={(e) => { e.stopPropagation(); void handleUpdateAppointmentStatus(appt, 'dibatalkan'); }}
                                                    >
                                                         Batal Survey
                                                     </button>
                                                </div>
                                             </div>
                                        </div>
                                    )}
                                </div>
                            );
                        };

                        const showHariIni = apptSubTab === 'semua' || apptSubTab === 'hari_ini';
                        const showNanti = apptSubTab === 'semua' || apptSubTab === 'nanti';
                        const showTerlewat = apptSubTab === 'semua' || apptSubTab === 'terlewat';

                        const hasNoItems = (apptSubTab === 'hari_ini' && grouped.hari_ini.length === 0) ||
                                           (apptSubTab === 'nanti' && grouped.nanti.length === 0) ||
                                           (apptSubTab === 'terlewat' && grouped.terlewat.length === 0);

                        return (
                            <div className="dt-appointments-container">
                                <div className="dt-subtabs">
                                    <button type="button" className={`dt-subtab${apptSubTab === 'semua' ? ' is-active' : ''}`} onClick={() => setApptSubTab('semua')}>
                                        Semua ({filtered.length})
                                    </button>
                                    <button type="button" className={`dt-subtab${apptSubTab === 'hari_ini' ? ' is-active' : ''}`} onClick={() => setApptSubTab('hari_ini')}>
                                        Hari Ini ({grouped.hari_ini.length})
                                    </button>
                                    <button type="button" className={`dt-subtab${apptSubTab === 'nanti' ? ' is-active' : ''}`} onClick={() => setApptSubTab('nanti')}>
                                        Nanti ({grouped.nanti.length})
                                    </button>
                                    <button type="button" className={`dt-subtab${apptSubTab === 'terlewat' ? ' is-active' : ''}`} onClick={() => setApptSubTab('terlewat')}>
                                        Terlewat ({grouped.terlewat.length})
                                    </button>
                                </div>

                                {hasNoItems ? (
                                    <div className="dt-empty" style={{ padding: '40px 16px' }}>
                                        <div className="dt-empty-title">Tidak ada janji temu</div>
                                        <div className="dt-empty-desc">Tidak ada janji temu untuk kategori ini.</div>
                                    </div>
                                ) : (
                                    <>
                                        {showHariIni && grouped.hari_ini.length > 0 && (
                                            <div className="dt-group-section">
                                                <h3 className="dt-group-title">Hari ini</h3>
                                                <div className="dt-task-grid">
                                                    {grouped.hari_ini.map(renderApptCard)}
                                                </div>
                                            </div>
                                        )}
                                        {showNanti && grouped.nanti.length > 0 && (
                                            <div className="dt-group-section">
                                                <h3 className="dt-group-title">Nanti</h3>
                                                <div className="dt-task-grid">
                                                    {grouped.nanti.map(renderApptCard)}
                                                </div>
                                            </div>
                                        )}
                                        {showTerlewat && grouped.terlewat.length > 0 && (
                                            <div className="dt-group-section">
                                                <h3 className="dt-group-title">Terlewat</h3>
                                                <div className="dt-task-grid">
                                                    {grouped.terlewat.map(renderApptCard)}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
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

                        const groupLess = [];
                        const groupMore = [];
                        filtered.forEach((lead) => {
                            if (isOlderThan30Days(lead.updatedAt)) {
                                groupMore.push(lead);
                            } else {
                                groupLess.push(lead);
                            }
                        });

                        const renderHotCard = (lead) => {
                            const badges = [
                                { label: 'HOT', className: 'badge-hot' }
                            ];
                            if (lead && lead.customerPipelineTotalSteps > 0) {
                                badges.push({
                                    label: `FU ${lead.customerPipelineCompletedCount}/${lead.customerPipelineTotalSteps}`,
                                    className: 'badge-purple'
                                });
                            }

                            return (
                                <div
                                    key={lead.id}
                                    className="dt-card dt-card-hot"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => router.push(`/leads/${lead.id}`)}
                                >
                                    {/* header */}
                                    {renderCardHeader(lead.name, lead.phone, badges, true)}

                                    {/* meta */}
                                    {renderDisplayLeadCardInfo(normalizeLeadCardData(lead, 'hot'))}

                                    {/* actions */}
                                    <div className="dt-hot-actions" onClick={(e) => e.stopPropagation()} style={{ marginTop: '12px' }}>
                                        <a
                                            href={toWaLink(lead.phone)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-whatsapp"
                                            style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                            Chat WhatsApp
                                        </a>
                                    </div>
                                </div>
                            );
                        };

                        const showLess = hotSubTab === 'semua' || hotSubTab === 'kurang_dari_1_bulan';
                        const showMore = hotSubTab === 'semua' || hotSubTab === 'lebih_dari_1_bulan';

                        const hasNoItems = (hotSubTab === 'kurang_dari_1_bulan' && groupLess.length === 0) ||
                                           (hotSubTab === 'lebih_dari_1_bulan' && groupMore.length === 0);

                        return (
                            <div className="dt-hot-container">
                                <div className="dt-subtabs">
                                    <button type="button" className={`dt-subtab${hotSubTab === 'semua' ? ' is-active' : ''}`} onClick={() => setHotSubTab('semua')}>
                                        Semua ({filtered.length})
                                    </button>
                                    <button type="button" className={`dt-subtab${hotSubTab === 'kurang_dari_1_bulan' ? ' is-active' : ''}`} onClick={() => setHotSubTab('kurang_dari_1_bulan')}>
                                        &lt; 1 Bulan ({groupLess.length})
                                    </button>
                                    <button type="button" className={`dt-subtab${hotSubTab === 'lebih_dari_1_bulan' ? ' is-active' : ''}`} onClick={() => setHotSubTab('lebih_dari_1_bulan')}>
                                        &gt; 1 Bulan ({groupMore.length})
                                    </button>
                                </div>

                                {hasNoItems ? (
                                    <div className="dt-empty" style={{ padding: '40px 16px' }}>
                                        <div className="dt-empty-title">Tidak ada lead HOT</div>
                                        <div className="dt-empty-desc">Tidak ada lead HOT untuk kategori ini.</div>
                                    </div>
                                ) : (
                                    <>
                                        {showLess && groupLess.length > 0 && (
                                            <div className="dt-group-section">
                                                <h3 className="dt-group-title">&lt; 1 Bulan</h3>
                                                <div className="dt-task-grid">
                                                    {groupLess.map(renderHotCard)}
                                                </div>
                                            </div>
                                        )}
                                        {showMore && groupMore.length > 0 && (
                                            <div className="dt-group-section">
                                                <h3 className="dt-group-title">&gt; 1 Bulan</h3>
                                                <div className="dt-task-grid">
                                                    {groupMore.map(renderHotCard)}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })() : null}
                </>
            ) : null}
        </div>
    );
}
