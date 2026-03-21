'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { apiRequest } from '../lib/api';

function toReadableBroadcastStatus(value) {
    switch (value) {
        case 'running':
            return 'Running';
        case 'stopped':
            return 'Stopped';
        case 'completed':
            return 'Completed';
        case 'error':
            return 'Error';
        default:
            return 'Idle';
    }
}

export default function BroadcastPage() {
    const { user } = useAuth();
    const tenant = useTenant();
    const activeClientId = tenant.whatsapp?.activeClientId || null;
    const [broadcastForm, setBroadcastForm] = useState({
        statuses: { hot: true, warm: true, cold: true },
        appointmentTag: 'all',
        dateFrom: '',
        dateTo: '',
        message: '',
        intervalMinutes: 2,
        mediaDataUrl: '',
        mediaName: '',
    });
    const [broadcastStatus, setBroadcastStatus] = useState(null);
    const [broadcastLoading, setBroadcastLoading] = useState(false);
    const [broadcastStopping, setBroadcastStopping] = useState(false);
    const [broadcastEstimating, setBroadcastEstimating] = useState(false);
    const [broadcastStatusLoading, setBroadcastStatusLoading] = useState(false);
    const [broadcastFeedback, setBroadcastFeedback] = useState('');
    const [broadcastError, setBroadcastError] = useState('');
    const [broadcastEstimate, setBroadcastEstimate] = useState(null);

    const buildBroadcastPayload = useCallback((includeContent = true) => {
        const salesStatuses = Object.entries(broadcastForm.statuses)
            .filter(([, checked]) => checked)
            .map(([key]) => key);

        return {
            ...(user?.role === 'root_admin' && activeClientId ? { clientId: activeClientId } : {}),
            salesStatuses,
            appointmentTag: broadcastForm.appointmentTag,
            dateFrom: broadcastForm.dateFrom || undefined,
            dateTo: broadcastForm.dateTo || undefined,
            ...(includeContent ? {
                message: broadcastForm.message,
                mediaDataUrl: broadcastForm.mediaDataUrl || undefined,
                intervalMinutes: Number(broadcastForm.intervalMinutes),
            } : {}),
        };
    }, [activeClientId, broadcastForm, user]);

    const loadBroadcastStatus = useCallback(async (silent = false) => {
        if (!silent) {
            setBroadcastStatusLoading(true);
        }

        try {
            const path =
                user?.role === 'root_admin' && activeClientId
                    ? `/api/broadcast/status?clientId=${encodeURIComponent(activeClientId)}`
                    : '/api/broadcast/status';
            const data = await apiRequest(path, { user });
            setBroadcastStatus(data || null);
            if (!silent) {
                setBroadcastFeedback(`Status: ${toReadableBroadcastStatus(data?.status || 'idle')}`);
            }
        } catch (err) {
            if (!silent) {
                setBroadcastError(err instanceof Error ? err.message : 'Failed load broadcast status');
            }
        } finally {
            if (!silent) {
                setBroadcastStatusLoading(false);
            }
        }
    }, [activeClientId, user]);

    useEffect(() => {
        void loadBroadcastStatus(true);
    }, [loadBroadcastStatus]);

    useEffect(() => {
        if (broadcastStatus?.status !== 'running') {
            return;
        }

        const intervalId = setInterval(() => {
            void loadBroadcastStatus(true);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [broadcastStatus?.status, loadBroadcastStatus]);

    useEffect(() => {
        setBroadcastEstimate(null);
    }, [
        activeClientId,
        broadcastForm.statuses.hot,
        broadcastForm.statuses.warm,
        broadcastForm.statuses.cold,
        broadcastForm.appointmentTag,
        broadcastForm.dateFrom,
        broadcastForm.dateTo,
    ]);

    const handleBroadcastMediaChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            setBroadcastForm((prev) => ({
                ...prev,
                mediaDataUrl: '',
                mediaName: '',
            }));
            return;
        }

        const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/');
        if (!isAllowed) {
            setBroadcastError('File harus image atau video');
            return;
        }

        setBroadcastError('');
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            setBroadcastForm((prev) => ({
                ...prev,
                mediaDataUrl: dataUrl,
                mediaName: file.name,
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleStartBroadcast = async (event) => {
        event.preventDefault();

        const { salesStatuses, ...payload } = buildBroadcastPayload();

        if (salesStatuses.length === 0) {
            setBroadcastError('Pilih minimal 1 status leads (hot/warm/cold)');
            return;
        }

        if (!broadcastForm.message.trim() && !broadcastForm.mediaDataUrl) {
            setBroadcastError('Isi text broadcast atau upload media');
            return;
        }

        if (!broadcastEstimate) {
            setBroadcastError('Check count data broadcast dulu sebelum start.');
            return;
        }

        if (broadcastEstimate.totalTargets <= 0) {
            setBroadcastError('Target broadcast kosong. Ubah filter lalu check count lagi.');
            return;
        }

        setBroadcastLoading(true);
        setBroadcastFeedback('');
        setBroadcastError('');

        try {
            const result = await apiRequest('/api/broadcast/start', {
                method: 'POST',
                user,
                body: {
                    salesStatuses,
                    ...payload,
                },
            });
            setBroadcastStatus(result || null);
            setBroadcastEstimate((prev) => prev || { totalTargets: result?.totalTargets || 0 });
            setBroadcastFeedback(`Broadcast started. Targets: ${result?.totalTargets || 0}`);
        } catch (err) {
            setBroadcastError(err instanceof Error ? err.message : 'Failed start broadcast');
        } finally {
            setBroadcastLoading(false);
        }
    };

    const handleEstimateBroadcast = async () => {
        const { salesStatuses, ...payload } = buildBroadcastPayload(false);

        if (salesStatuses.length === 0) {
            setBroadcastError('Pilih minimal 1 status leads (hot/warm/cold)');
            return;
        }

        setBroadcastEstimating(true);
        setBroadcastError('');
        setBroadcastFeedback('');

        try {
            const result = await apiRequest('/api/broadcast/estimate', {
                method: 'POST',
                user,
                body: {
                    salesStatuses,
                    ...payload,
                },
            });
            setBroadcastEstimate({
                totalTargets: Number(result?.totalTargets || 0),
                checkedAt: new Date().toISOString(),
            });
            setBroadcastFeedback(`Count checked. Total target nomor: ${result?.totalTargets || 0}`);
        } catch (err) {
            setBroadcastEstimate(null);
            setBroadcastError(err instanceof Error ? err.message : 'Failed check broadcast count');
        } finally {
            setBroadcastEstimating(false);
        }
    };

    const handleStopBroadcast = async () => {
        setBroadcastStopping(true);
        setBroadcastError('');
        setBroadcastFeedback('');
        try {
            const result = await apiRequest('/api/broadcast/stop', {
                method: 'POST',
                user,
                body: user?.role === 'root_admin' && activeClientId ? { clientId: activeClientId } : undefined,
            });
            setBroadcastStatus(result || null);
            setBroadcastFeedback('Broadcast stopped.');
        } catch (err) {
            setBroadcastError(err instanceof Error ? err.message : 'Failed stop broadcast');
        } finally {
            setBroadcastStopping(false);
        }
    };

    return (
        <div className="page-container">
            <Header
                title="WhatsApp Broadcast"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadBroadcastStatus()} disabled={broadcastStatusLoading}>
                        {broadcastStatusLoading ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            <form className="card broadcast-card" onSubmit={handleStartBroadcast}>
                <div className="lead-row-meta broadcast-status">
                    <span>Status: <strong>{toReadableBroadcastStatus(broadcastStatus?.status || 'idle')}</strong></span>
                    <span>Progress: <strong>{broadcastStatus?.processedTargets || 0}/{broadcastStatus?.totalTargets || 0}</strong> | Sent: {broadcastStatus?.sentCount || 0} | Failed: {broadcastStatus?.failedCount || 0}</span>
                    {broadcastStatus?.lastError ? <span style={{ color: 'var(--danger)' }}>Last Error: {broadcastStatus.lastError}</span> : null}
                </div>

                <div className="input-group">
                    <label>Status Leads Target</label>
                    <div className="detail-status-grid">
                        {['hot', 'warm', 'cold'].map((status) => (
                            <label key={status} className="filter-pill" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={broadcastForm.statuses[status]}
                                    onChange={(event) => setBroadcastForm((prev) => ({
                                        ...prev,
                                        statuses: {
                                            ...prev.statuses,
                                            [status]: event.target.checked,
                                        },
                                    }))}
                                    style={{ marginRight: 6 }}
                                />
                                {status.toUpperCase()}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="input-group">
                    <label>Status Appointment (Opsional)</label>
                    <select
                        className="input-field"
                        value={broadcastForm.appointmentTag}
                        onChange={(event) => setBroadcastForm((prev) => ({ ...prev, appointmentTag: event.target.value }))}
                    >
                        <option value="all">Semua</option>
                        <option value="mau_survey">Mau Survey</option>
                        <option value="sudah_survey">Sudah Survey</option>
                        <option value="none">Belum Ada Appointment</option>
                    </select>
                </div>

                <div className="input-group">
                    <label>Rentang Tanggal Leads Masuk</label>
                    <div className="broadcast-date-grid">
                        <input
                            type="date"
                            className="input-field"
                            value={broadcastForm.dateFrom}
                            onChange={(event) => setBroadcastForm((prev) => ({ ...prev, dateFrom: event.target.value }))}
                        />
                        <input
                            type="date"
                            className="input-field"
                            value={broadcastForm.dateTo}
                            onChange={(event) => setBroadcastForm((prev) => ({ ...prev, dateTo: event.target.value }))}
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label>Upload Media (1 image/video)</label>
                    <input
                        type="file"
                        className="input-field"
                        accept="image/*,video/*"
                        onChange={handleBroadcastMediaChange}
                    />
                    {broadcastForm.mediaName ? <span className="leads-result-count">Selected: {broadcastForm.mediaName}</span> : null}
                </div>

                <div className="input-group">
                    <label>Text Broadcast</label>
                    <textarea
                        className="input-field"
                        rows={4}
                        placeholder="Tulis pesan broadcast..."
                        value={broadcastForm.message}
                        onChange={(event) => setBroadcastForm((prev) => ({ ...prev, message: event.target.value }))}
                    />
                </div>

                <div className="input-group">
                    <label>Interval Kirim (menit)</label>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        className="input-field"
                        value={broadcastForm.intervalMinutes}
                        onChange={(event) => setBroadcastForm((prev) => ({ ...prev, intervalMinutes: Number(event.target.value || 1) }))}
                    />
                </div>

                <div className="broadcast-estimate-card">
                    <div>
                        <span className="broadcast-estimate-label">Target Broadcast</span>
                        <strong className="broadcast-estimate-count">
                            {broadcastEstimate ? `${broadcastEstimate.totalTargets} nomor` : 'Belum dicek'}
                        </strong>
                    </div>
                    <span className="broadcast-estimate-hint">
                        Check count dulu supaya admin tahu jumlah nomor yang akan menerima broadcast.
                    </span>
                </div>

                {broadcastError ? <div className="settings-error">{broadcastError}</div> : null}
                {broadcastFeedback ? <div className="settings-success">{broadcastFeedback}</div> : null}

                <div className="broadcast-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleEstimateBroadcast}
                        disabled={broadcastEstimating || broadcastLoading || broadcastStatus?.status === 'running'}
                    >
                        {broadcastEstimating ? 'Checking...' : 'Check Count'}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleStopBroadcast} disabled={broadcastStopping || broadcastStatus?.status !== 'running'}>
                        {broadcastStopping ? 'Stopping...' : 'Stop'}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={broadcastLoading || broadcastStatus?.status === 'running' || !broadcastEstimate || broadcastEstimate.totalTargets <= 0}
                    >
                        {broadcastLoading ? 'Starting...' : 'Start'}
                    </button>
                </div>
            </form>
        </div>
    );
}
