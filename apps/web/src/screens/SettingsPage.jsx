'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

const DEFAULT_API_BASE = 'http://localhost:3001';

function statusLabel(status) {
    switch (status) {
        case 'connected':
            return 'Connected';
        case 'awaiting_qr':
            return 'Waiting QR';
        case 'awaiting_pairing_code':
            return 'Waiting Pairing Code';
        case 'starting':
            return 'Starting';
        case 'disconnected':
            return 'Disconnected';
        case 'error':
            return 'Error';
        case 'disabled':
            return 'Disabled';
        default:
            return 'Idle';
    }
}

export default function SettingsPage() {
    const { user } = useAuth();
    const apiBase = useMemo(
        () => (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
        []
    );
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN || '';

    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [activeAction, setActiveAction] = useState('');
    const [actionFeedback, setActionFeedback] = useState('');
    const [actionFeedbackType, setActionFeedbackType] = useState('success');
    const [distributionStopLoading, setDistributionStopLoading] = useState(false);
    const [distributionFeedback, setDistributionFeedback] = useState('');
    const [distributionFeedbackType, setDistributionFeedbackType] = useState('success');
    const [systemSettingsLoading, setSystemSettingsLoading] = useState(true);
    const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);
    const [systemSettingsError, setSystemSettingsError] = useState('');
    const [systemSettingsFeedback, setSystemSettingsFeedback] = useState('');
    const [refreshingPage, setRefreshingPage] = useState(false);
    const [systemSettingsForm, setSystemSettingsForm] = useState({
        distributionAckTimeoutMinutes: 5,
        operationalStart: '09:00',
        operationalEnd: '21:00',
        operationalTimezone: 'Asia/Jakarta',
        outsideOfficeReply: '',
    });

    const request = useCallback(
        async (path, method = 'GET') => {
            const res = await fetch(`${apiBase}/api/whatsapp-admin${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(adminToken ? { 'x-admin-token': adminToken } : {}),
                },
            });

            if (!res.ok) {
                const body = await res.text();
                throw new Error(body || `HTTP ${res.status}`);
            }
            return res.json();
        },
        [apiBase, adminToken]
    );

    const loadStatus = useCallback(async (options = { silent: false }) => {
        if (!options.silent) {
            setStatusLoading(true);
            setActiveAction('status');
        }
        try {
            const data = await request('/status');
            setState(data);
            setError('');
            if (!options.silent) {
                setActionFeedback(`Status checked: ${statusLabel(data?.status)}`);
                setActionFeedbackType('success');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading status');
            if (!options.silent) {
                setActionFeedback('Status check failed');
                setActionFeedbackType('error');
            }
        } finally {
            if (!options.silent) {
                setStatusLoading(false);
                setActiveAction('');
            }
            setLoading(false);
        }
    }, [request]);

    useEffect(() => {
        void loadStatus({ silent: true });
    }, [loadStatus]);

    const loadSystemSettings = useCallback(async () => {
        if (!user) {
            return;
        }
        setSystemSettingsLoading(true);
        setSystemSettingsError('');
        try {
            const data = await apiRequest('/api/settings/system', { user });
            setSystemSettingsForm({
                distributionAckTimeoutMinutes: Number(data?.distributionAckTimeoutMinutes || 5),
                operationalStart: data?.operationalStart || '09:00',
                operationalEnd: data?.operationalEnd || '21:00',
                operationalTimezone: data?.operationalTimezone || 'Asia/Jakarta',
                outsideOfficeReply: data?.outsideOfficeReply || '',
            });
        } catch (err) {
            setSystemSettingsError(err instanceof Error ? err.message : 'Failed loading system settings');
        } finally {
            setSystemSettingsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadSystemSettings();
    }, [loadSystemSettings]);


    useEffect(() => {
        if (!state?.status) {
            return;
        }

        const shouldPoll =
            state.status === 'starting' ||
            state.status === 'awaiting_qr' ||
            state.status === 'awaiting_pairing_code';

        if (!shouldPoll) {
            return;
        }

        const timer = setInterval(() => {
            void loadStatus({ silent: true });
        }, 2500);
        return () => clearInterval(timer);
    }, [state?.status, loadStatus]);

    const runAction = async (path, actionName) => {
        setActionLoading(true);
        setActiveAction(actionName);
        setActionFeedback('');
        try {
            const data = await request(path, 'POST');
            setState(data);
            setError('');
            setActionFeedback(`${actionName} success: ${statusLabel(data?.status)}`);
            setActionFeedbackType('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed');
            setActionFeedback(`${actionName} failed`);
            setActionFeedbackType('error');
        } finally {
            setActionLoading(false);
            setActiveAction('');
        }
    };

    const stopAllDistribution = async () => {
        const confirmed = window.confirm('Stop semua distribusi lead yang sedang aktif?');
        if (!confirmed) {
            return;
        }

        setDistributionStopLoading(true);
        setDistributionFeedback('');
        try {
            const result = await apiRequest('/api/distribution/stop-all', {
                method: 'POST',
                user,
            });
            setDistributionFeedbackType('success');
            setDistributionFeedback(`Stop berhasil. ${result?.stoppedCycles || 0} cycle dihentikan.`);
        } catch (err) {
            setDistributionFeedbackType('error');
            setDistributionFeedback(err instanceof Error ? err.message : 'Failed stopping distribution');
        } finally {
            setDistributionStopLoading(false);
        }
    };

    const saveSystemSettings = async (event) => {
        event.preventDefault();
        if (!user) {
            setSystemSettingsError('Unauthorized');
            return;
        }
        setSystemSettingsSaving(true);
        setSystemSettingsError('');
        setSystemSettingsFeedback('');
        try {
            await apiRequest('/api/settings/system', {
                method: 'PATCH',
                user,
                body: {
                    distributionAckTimeoutMinutes: Number(systemSettingsForm.distributionAckTimeoutMinutes),
                    operationalStart: systemSettingsForm.operationalStart,
                    operationalEnd: systemSettingsForm.operationalEnd,
                    operationalTimezone: systemSettingsForm.operationalTimezone,
                    outsideOfficeReply: systemSettingsForm.outsideOfficeReply,
                },
            });
            setSystemSettingsFeedback('System settings berhasil disimpan.');
            await loadSystemSettings();
        } catch (err) {
            setSystemSettingsError(err instanceof Error ? err.message : 'Failed saving system settings');
        } finally {
            setSystemSettingsSaving(false);
        }
    };

    const refreshPageData = async () => {
        setRefreshingPage(true);
        try {
            await Promise.all([loadStatus(), loadSystemSettings()]);
        } finally {
            setRefreshingPage(false);
        }
    };

    const isBusy = loading || actionLoading || statusLoading;

    return (
        <div className="page-container">
            <Header
                title="WhatsApp Settings"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void refreshPageData()} disabled={refreshingPage || isBusy || systemSettingsLoading || systemSettingsSaving}>
                        {refreshingPage ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            <div className="card settings-card">
                <div className="settings-header">
                    <h3>Session Status</h3>
                    <span className={`badge ${state?.status === 'connected' ? 'badge-success' : 'badge-purple'}`}>
                        {statusLabel(state?.status)}
                    </span>
                </div>

                <p className="settings-meta"><strong>Provider:</strong> {state?.provider || '-'}</p>
                <p className="settings-meta"><strong>Auth Path:</strong> {state?.authPath || '-'}</p>
                <p className="settings-meta"><strong>Updated:</strong> {state?.updatedAt || '-'}</p>
                {state?.lastDisconnectCode ? (
                    <p className="settings-meta"><strong>Last Disconnect Code:</strong> {state.lastDisconnectCode}</p>
                ) : null}
                {state?.lastError ? (
                    <p className="settings-error">Error: {state.lastError}</p>
                ) : null}
                {error ? <p className="settings-error">{error}</p> : null}
            </div>

            <div className="card settings-card">
                <h3>Link WhatsApp Device</h3>
                {!loading && state?.qrImageUrl ? (
                    <div className="settings-qr-wrap">
                        <img src={state.qrImageUrl} alt="WhatsApp QR" className="settings-qr-image" />
                        <p className="settings-help">Scan QR ini dari WhatsApp {'>'} Linked Devices.</p>
                    </div>
                ) : null}

                {!loading && !state?.qrImageUrl && state?.pairingCode ? (
                    <div className="settings-pairing-wrap">
                        <p className="settings-help">Pairing code (Link with phone number):</p>
                        <div className="settings-pairing-code">{state.pairingCode}</div>
                    </div>
                ) : null}

                {!loading && !state?.qrImageUrl && !state?.pairingCode ? (
                    <p className="settings-help">Belum ada QR aktif. Klik Restart Session lalu tunggu QR muncul di sini.</p>
                ) : null}
            </div>

            <div className="card settings-card">
                <h3>Session Actions</h3>
                <div className="settings-actions">
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => void loadStatus()}>
                        {statusLoading && activeAction === 'status' ? 'Checking...' : 'Status Check'}
                    </button>
                    <button className="btn btn-secondary" disabled={isBusy} onClick={() => void runAction('/restart', 'restart')}>
                        {actionLoading && activeAction === 'restart' ? 'Restarting...' : 'Restart Session'}
                    </button>
                    <button className="btn btn-danger" disabled={isBusy} onClick={() => void runAction('/stop', 'stop')}>
                        {actionLoading && activeAction === 'stop' ? 'Stopping...' : 'Stop'}
                    </button>
                </div>
                <p className="settings-help">
                    Restart Session akan reset auth lama lalu memulai sesi baru.
                </p>
                {actionFeedback ? (
                    <p className={actionFeedbackType === 'error' ? 'settings-error' : 'settings-success'}>
                        {actionFeedback}
                    </p>
                ) : null}
            </div>

            <div className="card settings-card">
                <h3>Distribution Control</h3>
                <button className="btn btn-danger btn-full" onClick={stopAllDistribution} disabled={distributionStopLoading}>
                    {distributionStopLoading ? 'Stopping...' : 'Stop Distribution'}
                </button>
                <p className="settings-help">Tombol ini untuk emergency stop distribusi lead yang sedang berjalan.</p>
                {distributionFeedback ? (
                    <p className={distributionFeedbackType === 'error' ? 'settings-error' : 'settings-success'}>
                        {distributionFeedback}
                    </p>
                ) : null}
            </div>

            <form className="card settings-card" onSubmit={saveSystemSettings}>
                <h3>Distribution Timeout</h3>
                <div className="input-group">
                    <label>Batas waktu claim OK (menit)</label>
                    <select
                        className="input-field"
                        value={systemSettingsForm.distributionAckTimeoutMinutes}
                        onChange={(event) =>
                            setSystemSettingsForm((prev) => ({
                                ...prev,
                                distributionAckTimeoutMinutes: Number(event.target.value),
                            }))
                        }
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    >
                        <option value={5}>5 menit</option>
                        <option value={10}>10 menit</option>
                        <option value={15}>15 menit</option>
                    </select>
                </div>

                <h3 style={{ marginTop: 12 }}>Operational Hours</h3>
                <div className="input-group">
                    <label>Jam buka</label>
                    <input
                        type="time"
                        className="input-field"
                        value={systemSettingsForm.operationalStart}
                        onChange={(event) =>
                            setSystemSettingsForm((prev) => ({
                                ...prev,
                                operationalStart: event.target.value,
                            }))
                        }
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                </div>

                <div className="input-group">
                    <label>Jam tutup</label>
                    <input
                        type="time"
                        className="input-field"
                        value={systemSettingsForm.operationalEnd}
                        onChange={(event) =>
                            setSystemSettingsForm((prev) => ({
                                ...prev,
                                operationalEnd: event.target.value,
                            }))
                        }
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                </div>

                <div className="input-group">
                    <label>Timezone</label>
                    <input
                        type="text"
                        className="input-field"
                        value={systemSettingsForm.operationalTimezone}
                        onChange={(event) =>
                            setSystemSettingsForm((prev) => ({
                                ...prev,
                                operationalTimezone: event.target.value,
                            }))
                        }
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                </div>

                <div className="input-group">
                    <label>Auto reply di luar jam operasional</label>
                    <textarea
                        className="input-field"
                        rows={4}
                        value={systemSettingsForm.outsideOfficeReply}
                        onChange={(event) =>
                            setSystemSettingsForm((prev) => ({
                                ...prev,
                                outsideOfficeReply: event.target.value,
                            }))
                        }
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                </div>

                {systemSettingsError ? <p className="settings-error">{systemSettingsError}</p> : null}
                {systemSettingsFeedback ? <p className="settings-success">{systemSettingsFeedback}</p> : null}

                <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={systemSettingsLoading || systemSettingsSaving}
                    style={{ marginTop: 10 }}
                >
                    {systemSettingsSaving ? 'Menyimpan...' : 'Simpan Settings'}
                </button>
            </form>

        </div>
    );
}
