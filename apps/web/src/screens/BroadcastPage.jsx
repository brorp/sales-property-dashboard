'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DatePicker from '../components/DatePicker';
import Header from '../components/Header';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { apiRequest } from '../lib/api';
import './BroadcastPage.css';
import './SettingsPage.css';

const IconCheck = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const IconUpload = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const IconFile = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </svg>
);

function toReadableBroadcastStatus(value) {
    switch (value) {
        case 'running': return 'Berjalan';
        case 'stopped': return 'Berhenti';
        case 'completed': return 'Selesai';
        case 'error': return 'Error';
        default: return 'Siaga';
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
        intervalSeconds: 8,
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
    const mediaInputRef = useRef(null);

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
                intervalSeconds: Number(broadcastForm.intervalSeconds),
            } : {}),
        };
    }, [activeClientId, broadcastForm, user]);

    const loadBroadcastStatus = useCallback(async (silent = false) => {
        if (!silent) setBroadcastStatusLoading(true);
        try {
            const path = user?.role === 'root_admin' && activeClientId
                ? `/api/broadcast/status?clientId=${encodeURIComponent(activeClientId)}`
                : '/api/broadcast/status';
            const data = await apiRequest(path, { user });
            setBroadcastStatus(data || null);
            if (!silent) setBroadcastFeedback(`Status: ${toReadableBroadcastStatus(data?.status || 'idle')}`);
        } catch (err) {
            if (!silent) setBroadcastError(err instanceof Error ? err.message : 'Failed load broadcast status');
        } finally {
            if (!silent) setBroadcastStatusLoading(false);
        }
    }, [activeClientId, user]);

    useEffect(() => {
        void loadBroadcastStatus(true);
    }, [loadBroadcastStatus]);

    useEffect(() => {
        if (broadcastStatus?.status !== 'running') return;
        const intervalId = setInterval(() => { void loadBroadcastStatus(true); }, 5000);
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
            setBroadcastForm((prev) => ({ ...prev, mediaDataUrl: '', mediaName: '' }));
            return;
        }
        const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/');
        if (!isAllowed) { setBroadcastError('File harus image atau video'); return; }
        setBroadcastError('');
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            setBroadcastForm((prev) => ({ ...prev, mediaDataUrl: dataUrl, mediaName: file.name }));
        };
        reader.readAsDataURL(file);
    };

    const handleStartBroadcast = async (event) => {
        event.preventDefault();
        const { salesStatuses, ...payload } = buildBroadcastPayload();
        if (salesStatuses.length === 0) { setBroadcastError('Pilih minimal 1 status leads (hot/warm/cold)'); return; }
        if (!broadcastForm.message.trim() && !broadcastForm.mediaDataUrl) { setBroadcastError('Isi text broadcast atau upload media'); return; }
        if (!broadcastEstimate) { setBroadcastError('Check count data broadcast dulu sebelum start.'); return; }
        if (broadcastEstimate.totalTargets <= 0) { setBroadcastError('Target broadcast kosong. Ubah filter lalu check count lagi.'); return; }
        setBroadcastLoading(true);
        setBroadcastFeedback('');
        setBroadcastError('');
        try {
            const result = await apiRequest('/api/broadcast/start', {
                method: 'POST',
                user,
                body: { salesStatuses, ...payload },
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
        if (salesStatuses.length === 0) { setBroadcastError('Pilih minimal 1 status leads (hot/warm/cold)'); return; }
        setBroadcastEstimating(true);
        setBroadcastError('');
        setBroadcastFeedback('');
        try {
            const result = await apiRequest('/api/broadcast/estimate', {
                method: 'POST',
                user,
                body: { salesStatuses, ...payload },
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
        <div className="page-container set-page">
            <Header
                title="WhatsApp Broadcast"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void loadBroadcastStatus()} disabled={broadcastStatusLoading} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                )}
            />

            <form className="set-card broadcast-card" onSubmit={handleStartBroadcast}>
                <div className="broadcast-status-row">
                    <span>Status: <strong>{toReadableBroadcastStatus(broadcastStatus?.status || 'idle')}</strong></span>
                    <span>Progress: <strong>{broadcastStatus?.processedTargets || 0}/{broadcastStatus?.totalTargets || 0}</strong> | Sent: {broadcastStatus?.sentCount || 0} | Failed: {broadcastStatus?.failedCount || 0}</span>
                    {broadcastStatus?.lastError ? <span className="broadcast-last-error">Last Error: {broadcastStatus.lastError}</span> : null}
                </div>

                <div className="input-group">
                    <label>Status Leads Target</label>
                    <div className="broadcast-status-pills">
                        {[
                            { key: 'hot', label: 'Hot' },
                            { key: 'warm', label: 'Warm' },
                            { key: 'cold', label: 'Cold' },
                        ].map(({ key, label }) => (
                            <label key={key} className={`broadcast-status-pill broadcast-status-pill--${key}${broadcastForm.statuses[key] ? ' is-checked' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={broadcastForm.statuses[key]}
                                    onChange={(e) => setBroadcastForm((prev) => ({
                                        ...prev,
                                        statuses: { ...prev.statuses, [key]: e.target.checked },
                                    }))}
                                />
                                <span className="broadcast-pill-dot" />
                                {label}
                                {broadcastForm.statuses[key] ? <IconCheck /> : null}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="input-group">
                    <label>Status Janji Temu (Opsional)</label>
                    <Select
                        options={[
                            { value: 'all', label: 'Semua' },
                            { value: 'mau_survey', label: 'Mau Survey' },
                            { value: 'sudah_survey', label: 'Sudah Survey' },
                            { value: 'none', label: 'Belum Ada Janji Temu' },
                        ]}
                        value={broadcastForm.appointmentTag}
                        onChange={(val) => setBroadcastForm((prev) => ({ ...prev, appointmentTag: val }))}
                        clearable={false}
                        variant="white"
                    />
                </div>

                <div className="broadcast-date-grid">
                    <DatePicker
                        label="Dari"
                        value={broadcastForm.dateFrom}
                        onChange={(val) => setBroadcastForm((prev) => ({ ...prev, dateFrom: val }))}
                        placeholder="Pilih tanggal"
                    />
                    <DatePicker
                        label="Sampai"
                        value={broadcastForm.dateTo}
                        onChange={(val) => setBroadcastForm((prev) => ({ ...prev, dateTo: val }))}
                        placeholder="Pilih tanggal"
                        align="right"
                    />
                </div>

                <div className="input-group">
                    <label>Upload Media (opsional)</label>
                    <input
                        ref={mediaInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleBroadcastMediaChange}
                        style={{ display: 'none' }}
                    />
                    {broadcastForm.mediaName ? (
                        <div className="broadcast-file-preview">
                            <IconFile />
                            <span>{broadcastForm.mediaName}</span>
                            <button
                                type="button"
                                className="broadcast-file-clear"
                                onClick={() => {
                                    setBroadcastForm((prev) => ({ ...prev, mediaDataUrl: '', mediaName: '' }));
                                    if (mediaInputRef.current) mediaInputRef.current.value = '';
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ) : (
                        <button type="button" className="broadcast-upload-zone" onClick={() => mediaInputRef.current?.click()}>
                            <IconUpload />
                            <span>Klik untuk memilih file</span>
                            <span className="broadcast-upload-hint">Image atau video · maks 1 file</span>
                        </button>
                    )}
                </div>

                <div className="input-group">
                    <label>Teks Broadcast</label>
                    <textarea
                        className="input-field"
                        rows={4}
                        placeholder="Tulis pesan broadcast..."
                        value={broadcastForm.message}
                        onChange={(e) => setBroadcastForm((prev) => ({ ...prev, message: e.target.value }))}
                    />
                </div>

                <div className="input-group">
                    <label>Interval Kirim (detik)</label>
                    <input
                        type="number"
                        min={8}
                        step={1}
                        className="input-field"
                        value={broadcastForm.intervalSeconds}
                        onChange={(e) => setBroadcastForm((prev) => ({ ...prev, intervalSeconds: Number(e.target.value || 8) }))}
                    />
                    <span className="settings-help">
                        Minimum 8 detik. Server juga menambahkan jeda acak kecil untuk mengurangi pola kirim yang terlalu bot-like.
                    </span>
                </div>

                <div className={`broadcast-estimate-card${broadcastEstimate ? ' has-estimate' : ''}`}>
                    <div className="broadcast-estimate-left">
                        <span className="broadcast-estimate-label">Target Broadcast</span>
                        <strong className="broadcast-estimate-count">
                            {broadcastEstimate ? `${broadcastEstimate.totalTargets} nomor` : '—'}
                        </strong>
                        {broadcastEstimate ? (
                            <span className="broadcast-estimate-checked">sudah dicek</span>
                        ) : (
                            <span className="broadcast-estimate-hint-inline">belum dicek</span>
                        )}
                    </div>
                    <span className="broadcast-estimate-hint">
                        {broadcastEstimate
                            ? `${broadcastEstimate.totalTargets} nomor akan menerima broadcast ini.`
                            : 'Klik Check Count dulu supaya admin tahu jumlah penerima.'}
                    </span>
                </div>

                {broadcastError ? <p className="settings-error">{broadcastError}</p> : null}
                {broadcastFeedback ? <p className="settings-success">{broadcastFeedback}</p> : null}

                <div className="broadcast-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleEstimateBroadcast}
                        disabled={broadcastEstimating || broadcastLoading || broadcastStatus?.status === 'running'}
                    >
                        {broadcastEstimating ? 'Checking...' : 'Check Count'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={handleStopBroadcast}
                        disabled={broadcastStopping || broadcastStatus?.status !== 'running'}
                    >
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
