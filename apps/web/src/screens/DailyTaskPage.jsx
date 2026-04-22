'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { uploadTaskProofImage } from '../lib/image-upload';
import { SALES_STATUSES, getSalesStatusLabel, getTimeAgo } from '../constants/crm';

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isOlderThanDays(value, days) {
    if (!value) {
        return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function getVisibleSalesStatuses(task) {
    const baseKeys = ['warm', 'hot', 'error', 'skip'];
    if (isOlderThanDays(task?.createdAt, 14)) {
        baseKeys.push('cold', 'no_response');
    }

    return SALES_STATUSES.filter((item) => baseKeys.includes(item.key));
}

function getTaskUrgencyCopy(task) {
    if (!task?.dueAt) {
        return 'Deadline belum tersedia';
    }

    const dueAt = new Date(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
        return 'Deadline belum tersedia';
    }

    if (task.status === 'overdue' || dueAt.getTime() <= Date.now()) {
        return `Overdue sejak ${formatDateTime(task.dueAt)}`;
    }

    return `Deadline ${formatDateTime(task.dueAt)}`;
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

export default function DailyTaskPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('new_leads');
    const [tasks, setTasks] = useState({ newLeads: [], followUps: [], counts: { totalCount: 0, newLeadCount: 0, followUpCount: 0 } });
    const [drafts, setDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [validatedHot, setValidatedHot] = useState([]);
    const [sideLoading, setSideLoading] = useState(false);

    const mergeDraft = useCallback((taskId, partial) => {
        setDrafts((prev) => ({
            ...prev,
            [taskId]: {
                ...(prev[taskId] || {}),
                ...partial,
            },
        }));
    }, []);

    const loadTasks = useCallback(async ({ silent = false } = {}) => {
        if (!user) {
            return;
        }

        if (!silent) {
            setLoading(true);
            setError('');
        }

        try {
            const data = await apiRequest('/api/daily-tasks', { user });
            const normalized = {
                newLeads: Array.isArray(data?.newLeads) ? data.newLeads : [],
                followUps: Array.isArray(data?.followUps) ? data.followUps : [],
                counts: {
                    totalCount: Number(data?.counts?.totalCount || 0),
                    newLeadCount: Number(data?.counts?.newLeadCount || 0),
                    followUpCount: Number(data?.counts?.followUpCount || 0),
                },
            };
            setTasks(normalized);
            setDrafts((prev) => {
                const next = { ...prev };
                [...normalized.newLeads, ...normalized.followUps].forEach((task) => {
                    next[task.id] = {
                        ...buildDefaultDraft(task),
                        ...(prev[task.id] || {}),
                    };
                });
                return next;
            });
        } catch (err) {
            if (!silent) {
                setError(err instanceof Error ? err.message : 'Gagal memuat Daily Task');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
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
            // Filter only active appointments for this sales user
            const activeAppts = Array.isArray(apptData)
                ? apptData.filter((a) => a.status === 'mau_survey' && a.salesId === user.id)
                : [];
            setAppointments(activeAppts);
            setValidatedHot(Array.isArray(hotData) ? hotData : []);
        } catch {
            // non-critical, ignore errors silently
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
            if (hasBusyDraft) {
                return;
            }
            await loadTasks({ silent: true });
            await loadSideData({ silent: true });
        },
    });

    const visibleTasks = activeTab === 'new_leads' ? tasks.newLeads : tasks.followUps;

    const handleUploadProof = async (task, file) => {
        if (!file || !user) {
            return;
        }

        mergeDraft(task.id, {
            uploadError: '',
            uploading: true,
        });

        try {
            const uploaded = await uploadTaskProofImage(file, user);
            mergeDraft(task.id, {
                previewUrl: uploaded.dataUrl,
                screenshotUrl: uploaded.url,
                uploading: false,
            });
        } catch (err) {
            mergeDraft(task.id, {
                uploading: false,
                uploadError: err instanceof Error ? err.message : 'Gagal upload screenshot',
            });
        }
    };

    const handleSubmitTask = async (task, endpoint, body = {}) => {
        if (!user) {
            return;
        }

        const draft = drafts[task.id] || buildDefaultDraft(task);
        if (!draft.screenshotUrl) {
            mergeDraft(task.id, { uploadError: 'Upload screenshot proof terlebih dahulu.' });
            return;
        }

        mergeDraft(task.id, { submitting: true, uploadError: '' });
        setError('');
        setSuccess('');

        try {
            await apiRequest(endpoint, {
                method: 'POST',
                user,
                body: {
                    screenshotUrl: draft.screenshotUrl,
                    ...body,
                },
            });
            setSuccess(`${task.label} berhasil disubmit.`);
            setDrafts((prev) => {
                const next = { ...prev };
                delete next[task.id];
                return next;
            });
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
        if (!draft.salesStatus) {
            setError('Status L2 wajib dipilih sebelum submit.');
            return;
        }

        await handleSubmitTask(
            task,
            `/api/daily-tasks/${task.id}/submit-new-lead`,
            { salesStatus: draft.salesStatus }
        );
    };

    const handleSubmitFollowUp = async (task) => {
        await handleSubmitTask(task, `/api/daily-tasks/${task.id}/submit-follow-up`);
    };

    return (
        <div className="page-container">
            <Header title="Daily Task" />

            <div className="card daily-task-summary-card">
                    <div className="section-title" style={{ marginBottom: 6 }}>Tugas Sales Hari Ini</div>
                <div className="daily-task-summary-stats">
                    <div className="daily-task-summary-pill">New Leads {tasks.counts.newLeadCount}</div>
                    <div className="daily-task-summary-pill">Follow Up {tasks.counts.followUpCount}</div>
                    {appointments.length > 0 ? <div className="daily-task-summary-pill">Appt {appointments.length}</div> : null}
                    {validatedHot.length > 0 ? <div className="daily-task-summary-pill">HOT ✓ {validatedHot.length}</div> : null}
                </div>
            </div>

            <div className="daily-task-tabs">
                <button
                    type="button"
                    className={`daily-task-tab ${activeTab === 'new_leads' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('new_leads')}
                >
                    New Leads
                    {tasks.counts.newLeadCount > 0 ? <span className="daily-task-tab-badge">{tasks.counts.newLeadCount}</span> : null}
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeTab === 'follow_ups' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('follow_ups')}
                >
                    Follow Up
                    {tasks.counts.followUpCount > 0 ? <span className="daily-task-tab-badge">{tasks.counts.followUpCount}</span> : null}
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeTab === 'appointments' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('appointments')}
                >
                    Appointment
                    {appointments.length > 0 ? <span className="daily-task-tab-badge">{appointments.length}</span> : null}
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeTab === 'hot_validated' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('hot_validated')}
                >
                    HOT ✓
                    {validatedHot.length > 0 ? <span className="daily-task-tab-badge" style={{ background: 'var(--green, #22c55e)' }}>{validatedHot.length}</span> : null}
                </button>
            </div>

            {error ? <div className="settings-error">{error}</div> : null}
            {success ? <div className="settings-success">{success}</div> : null}

            {/* ── New Leads / Follow Up tasks ────────────────────── */}
            {(activeTab === 'new_leads' || activeTab === 'follow_ups') ? (
                <>
                    {loading ? (
                        <div className="card"><p className="settings-help">Loading Daily Task...</p></div>
                    ) : null}

                    {!loading && visibleTasks.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-title">
                                {activeTab === 'new_leads' ? 'Tidak ada New Lead task' : 'Tidak ada Follow Up task'}
                            </div>
                            <div className="empty-subtitle">
                                Semua task di tab ini sudah selesai atau belum masuk milestone.
                            </div>
                        </div>
                    ) : null}

                    <div className="daily-task-list">
                        {visibleTasks.map((task) => {
                            const draft = drafts[task.id] || buildDefaultDraft(task);
                            const visibleStatuses = getVisibleSalesStatuses(task);

                            return (
                                <div key={task.id} className="card daily-task-card">
                                    <div className="daily-task-card-top">
                                        <div>
                                            <div className="daily-task-card-title">{task.leadName}</div>
                                            <div className="daily-task-card-meta">{task.leadPhone}</div>
                                            <div className="daily-task-card-meta">{task.leadSource}</div>
                                        </div>
                                        <div className="daily-task-card-badges">
                                            <span className={`badge ${task.status === 'overdue' ? 'badge-danger' : 'badge-warm'}`}>
                                                {task.status === 'overdue' ? 'Overdue' : task.label}
                                            </span>
                                            {task.taskType === 'follow_up' ? (
                                                <span className="badge badge-purple">
                                                    {task.followupStage}/3
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="daily-task-card-grid">
                                        <div className="daily-task-card-meta">Masuk task: {formatDateTime(task.assignedAt)}</div>
                                        <div className="daily-task-card-meta">{getTaskUrgencyCopy(task)}</div>
                                        <div className="daily-task-card-meta">Lead age: {getTimeAgo(task.createdAt)}</div>
                                        {task.acceptedAt ? (
                                            <div className="daily-task-card-meta">Accepted: {formatDateTime(task.acceptedAt)}</div>
                                        ) : null}
                                    </div>

                                    {task.taskType === 'new_lead' ? (
                                        <div className="input-group">
                                            <label>Status L2</label>
                                            <select
                                                className="input-field"
                                                value={draft.salesStatus || 'warm'}
                                                onChange={(event) => mergeDraft(task.id, { salesStatus: event.target.value })}
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
                                        <div className="settings-help" style={{ marginBottom: 12 }}>
                                            Submit screenshot proof untuk milestone {task.followupStage}/3.
                                        </div>
                                    )}

                                    <div className="daily-task-upload-row">
                                        <label className="btn btn-secondary daily-task-upload-trigger">
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp,image/gif"
                                                hidden
                                                onChange={(event) => void handleUploadProof(task, event.target.files?.[0] || null)}
                                            />
                                            {draft.uploading ? 'Uploading...' : draft.screenshotUrl ? 'Ganti Screenshot' : 'Upload Screenshot'}
                                        </label>
                                        <div className="settings-help" style={{ margin: 0 }}>
                                            PNG / JPG / WEBP / GIF, max 5MB
                                        </div>
                                    </div>

                                    {draft.uploadError ? <div className="settings-error" style={{ marginBottom: 12 }}>{draft.uploadError}</div> : null}

                                    {draft.previewUrl ? (
                                        <div className="daily-task-preview-wrap">
                                            <img src={draft.previewUrl} alt="Preview proof" className="daily-task-preview-image" />
                                        </div>
                                    ) : null}

                                    <div className="daily-task-actions">
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
                </>
            ) : null}

            {/* ── Appointment Saya ────────────────────────────────── */}
            {activeTab === 'appointments' ? (
                <>
                    {sideLoading ? <div className="card"><p className="settings-help">Memuat appointments...</p></div> : null}
                    {!sideLoading && appointments.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📅</div>
                            <div className="empty-title">Tidak ada appointment aktif</div>
                            <div className="empty-desc">Appointment dengan status Mau Survey akan muncul di sini.</div>
                        </div>
                    ) : null}
                    <div className="daily-task-list">
                        {appointments.map((appt) => (
                            <div
                                key={appt.id}
                                className="card card-clickable"
                                onClick={() => router.push(`/leads/${appt.leadId}`)}
                            >
                                <div className="daily-task-card-top">
                                    <div>
                                        <div className="daily-task-card-title">{appt.leadName}</div>
                                        <div className="daily-task-card-meta">📱 {appt.leadPhone}</div>
                                    </div>
                                    <span className="badge badge-hot">Mau Survey</span>
                                </div>
                                <div className="daily-task-card-grid">
                                    <div className="daily-task-card-meta">📅 {appt.date} 🕐 {appt.time}</div>
                                    <div className="daily-task-card-meta">📍 {appt.location}</div>
                                    {appt.notes ? <div className="daily-task-card-meta">📝 {appt.notes}</div> : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            {/* ── HOT Validated ───────────────────────────────────── */}
            {activeTab === 'hot_validated' ? (
                <>
                    {sideLoading ? <div className="card"><p className="settings-help">Memuat data...</p></div> : null}
                    {!sideLoading && validatedHot.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">🔥</div>
                            <div className="empty-title">Belum ada HOT Validated</div>
                            <div className="empty-desc">Lead HOT yang divalidasi supervisor akan muncul di sini.</div>
                        </div>
                    ) : null}
                    <div className="daily-task-list">
                        {validatedHot.map((lead) => (
                            <div
                                key={lead.id}
                                className="card card-clickable"
                                onClick={() => router.push(`/leads/${lead.id}`)}
                            >
                                <div className="daily-task-card-top">
                                    <div>
                                        <div className="daily-task-card-title">{lead.name}</div>
                                        <div className="daily-task-card-meta">📱 {lead.phone}</div>
                                        <div className="daily-task-card-meta">📣 {lead.source}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                        <span className="badge badge-hot">HOT</span>
                                        <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>✓ Validated</span>
                                    </div>
                                </div>
                                <div className="daily-task-card-meta" style={{ marginTop: 6 }}>
                                    🕒 Diupdate {getTimeAgo(lead.updatedAt)}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}
