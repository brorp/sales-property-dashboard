'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import Select from '../components/Select';
import TimePicker from '../components/TimePicker';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { apiRequest, getApiBaseUrl } from '../lib/api';
import './SettingsPage.css';

function statusLabel(status) {
    switch (status) {
        case 'connected': return 'Terhubung';
        case 'awaiting_qr': return 'Menunggu QR';
        case 'awaiting_pairing_code': return 'Menunggu Kode Pairing';
        case 'starting': return 'Memulai';
        case 'disconnected': return 'Terputus';
        case 'error': return 'Error';
        case 'disabled': return 'Dinonaktifkan';
        default: return 'Siaga';
    }
}

const IconWifi = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
);

const IconSmartphone = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

const IconZap = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
);

const IconAlertTriangle = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const IconSliders = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
);

export default function SettingsPage() {
    const { user } = useAuth();
    const tenant = useTenant();
    const apiBase = getApiBaseUrl();
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN || '';
    const activeClientId = tenant.whatsapp?.activeClientId || null;

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
    const [systemSettingsForm, setSystemSettingsForm] = useState({
        distributionAckTimeoutMinutes: 5,
        operationalStart: '09:00',
        operationalEnd: '21:00',
        operationalTimezone: 'Asia/Jakarta',
        outsideOfficeReply: '',
        insideOfficeReply: '',
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
        if (!options.silent) { setStatusLoading(true); setActiveAction('status'); }
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
            if (!options.silent) { setStatusLoading(false); setActiveAction(''); }
            setLoading(false);
        }
    }, [request]);

    useEffect(() => { void loadStatus({ silent: true }); }, [loadStatus]);

    const loadSystemSettings = useCallback(async () => {
        if (!user) return;
        setSystemSettingsLoading(true);
        setSystemSettingsError('');
        try {
            const targetPath = user.role === 'root_admin' && activeClientId
                ? `/api/settings/system?clientId=${encodeURIComponent(activeClientId)}`
                : '/api/settings/system';
            const data = await apiRequest(targetPath, { user });
            setSystemSettingsForm({
                distributionAckTimeoutMinutes: Number(data?.distributionAckTimeoutMinutes || 5),
                operationalStart: data?.operationalStart || '09:00',
                operationalEnd: data?.operationalEnd || '21:00',
                operationalTimezone: data?.operationalTimezone || 'Asia/Jakarta',
                outsideOfficeReply: data?.outsideOfficeReply || '',
                insideOfficeReply: data?.insideOfficeReply || 'Harap menunggu agent professional akan menghubungi anda',
            });
        } catch (err) {
            setSystemSettingsError(err instanceof Error ? err.message : 'Failed loading system settings');
        } finally {
            setSystemSettingsLoading(false);
        }
    }, [activeClientId, user]);

    useEffect(() => { void loadSystemSettings(); }, [loadSystemSettings]);

    useEffect(() => {
        if (!state?.status) return;
        const shouldPoll = state.status === 'starting' || state.status === 'awaiting_qr' || state.status === 'awaiting_pairing_code';
        if (!shouldPoll) return;
        const timer = setInterval(() => { void loadStatus({ silent: true }); }, 2500);
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
        if (!confirmed) return;
        setDistributionStopLoading(true);
        setDistributionFeedback('');
        try {
            const result = await apiRequest('/api/distribution/stop-all', {
                method: 'POST',
                user,
                body: user?.role === 'root_admin' && activeClientId ? { clientId: activeClientId } : undefined,
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
        if (!user) { setSystemSettingsError('Unauthorized'); return; }
        setSystemSettingsSaving(true);
        setSystemSettingsError('');
        setSystemSettingsFeedback('');
        try {
            await apiRequest('/api/settings/system', {
                method: 'PATCH',
                user,
                body: {
                    ...(user?.role === 'root_admin' && activeClientId ? { clientId: activeClientId } : {}),
                    distributionAckTimeoutMinutes: Number(systemSettingsForm.distributionAckTimeoutMinutes),
                    operationalStart: systemSettingsForm.operationalStart,
                    operationalEnd: systemSettingsForm.operationalEnd,
                    operationalTimezone: systemSettingsForm.operationalTimezone,
                    outsideOfficeReply: systemSettingsForm.outsideOfficeReply,
                    insideOfficeReply: systemSettingsForm.insideOfficeReply,
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

    const isBusy = loading || actionLoading || statusLoading;

    return (
        <div className="page-container set-page">
            <Header title="Pengaturan" showBack />

            {/* ── Session Status ─────────────────────────────── */}
            <div className="set-card">
                <div className="settings-header">
                    <h3 className="set-card-title">
                        <span className="set-card-icon"><IconWifi /></span>
                        Session Status
                    </h3>
                    <span className={`badge ${state?.status === 'connected' ? 'badge-success' : 'badge-neutral'}`}>
                        {statusLabel(state?.status)}
                    </span>
                </div>
                <div className="set-meta-list">
                    <div className="set-meta-item">
                        <span className="set-meta-key">Provider</span>
                        <span className="set-meta-val">{state?.provider || '-'}</span>
                    </div>
                    <div className="set-meta-item">
                        <span className="set-meta-key">WA Tenant</span>
                        <span className="set-meta-val">{state?.activeClientSlug || tenant.whatsapp?.activeClientSlug || '-'}</span>
                    </div>
                    <div className="set-meta-item">
                        <span className="set-meta-key">Active WA Number</span>
                        <span className="set-meta-val">{state?.activeWaNumber || '-'}</span>
                    </div>
                    <div className="set-meta-item">
                        <span className="set-meta-key">Auth Path</span>
                        <span className="set-meta-val">{state?.authPath || '-'}</span>
                    </div>
                    <div className="set-meta-item">
                        <span className="set-meta-key">Updated</span>
                        <span className="set-meta-val">{state?.updatedAt || '-'}</span>
                    </div>
                    {state?.lastDisconnectCode ? (
                        <div className="set-meta-item">
                            <span className="set-meta-key">Last Disconnect</span>
                            <span className="set-meta-val">{state.lastDisconnectCode}</span>
                        </div>
                    ) : null}
                </div>
                {tenant.whatsapp?.mode === 'shared_single_client' ? (
                    <p className="settings-help">
                        Local QR saat ini masih shared singleton dan diikat ke tenant <strong>{tenant.whatsapp?.activeClientSlug || '-'}</strong>.
                    </p>
                ) : null}
                {state?.lastError ? <p className="settings-error">Error: {state.lastError}</p> : null}
                {error ? <p className="settings-error">{error}</p> : null}
            </div>

            {/* ── Link WhatsApp Device ───────────────────────── */}
            <div className="set-card">
                <h3 className="set-card-title">
                    <span className="set-card-icon"><IconSmartphone /></span>
                    Link WhatsApp Device
                </h3>
                {!loading && state?.qrImageUrl ? (
                    <div className="settings-qr-wrap">
                        <img src={state.qrImageUrl} alt="WhatsApp QR" className="settings-qr-image" />
                        <p className="settings-help">Scan QR ini dari WhatsApp › Linked Devices.</p>
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

            {/* ── Session Actions ────────────────────────────── */}
            <div className="set-card">
                <h3 className="set-card-title">
                    <span className="set-card-icon"><IconZap /></span>
                    Session Actions
                </h3>
                <div className="settings-actions">
                    <button className="btn btn-secondary" disabled={isBusy} onClick={() => void loadStatus()}>
                        {statusLoading && activeAction === 'status' ? 'Checking...' : 'Status Check'}
                    </button>
                    <button className="btn btn-secondary" disabled={isBusy} onClick={() => void runAction('/restart', 'restart')}>
                        {actionLoading && activeAction === 'restart' ? 'Restarting...' : 'Restart Session'}
                    </button>
                    <button className="btn btn-danger" disabled={isBusy} onClick={() => void runAction('/stop', 'stop')}>
                        {actionLoading && activeAction === 'stop' ? 'Stopping...' : 'Stop'}
                    </button>
                </div>
                <p className="settings-help">Restart Session akan reset auth lama lalu memulai sesi baru.</p>
                {actionFeedback ? (
                    <p className={actionFeedbackType === 'error' ? 'settings-error' : 'settings-success'}>{actionFeedback}</p>
                ) : null}
            </div>

            {/* ── Distribution Control ───────────────────────── */}
            <div className="set-card">
                <h3 className="set-card-title">
                    <span className="set-card-icon set-card-icon--danger"><IconAlertTriangle /></span>
                    Distribution Control
                </h3>
                <button className="btn btn-danger btn-full" onClick={stopAllDistribution} disabled={distributionStopLoading}>
                    {distributionStopLoading ? 'Stopping...' : 'Stop Distribution'}
                </button>
                <p className="settings-help">Tombol ini untuk emergency stop distribusi lead yang sedang berjalan.</p>
                {distributionFeedback ? (
                    <p className={distributionFeedbackType === 'error' ? 'settings-error' : 'settings-success'}>{distributionFeedback}</p>
                ) : null}
            </div>

            {/* ── System Settings ────────────────────────────── */}
            <form className="set-card" onSubmit={saveSystemSettings}>
                <h3 className="set-card-title">
                    <span className="set-card-icon"><IconSliders /></span>
                    System Settings
                </h3>

                <div className="set-section-label">Distribution Timeout</div>
                <div className="input-group">
                    <label>Batas waktu claim OK (menit)</label>
                    <Select
                        options={[
                            { value: '5', label: '5 menit' },
                            { value: '10', label: '10 menit' },
                            { value: '15', label: '15 menit' },
                        ]}
                        value={String(systemSettingsForm.distributionAckTimeoutMinutes)}
                        onChange={(val) => setSystemSettingsForm((prev) => ({ ...prev, distributionAckTimeoutMinutes: Number(val) }))}
                        clearable={false}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                        variant="white"
                    />
                </div>

                <div className="set-section-label" style={{ marginTop: 16 }}>Operational Hours</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <TimePicker
                        label="Jam buka"
                        value={systemSettingsForm.operationalStart}
                        onChange={(val) => setSystemSettingsForm((prev) => ({ ...prev, operationalStart: val }))}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                    <TimePicker
                        label="Jam tutup"
                        value={systemSettingsForm.operationalEnd}
                        onChange={(val) => setSystemSettingsForm((prev) => ({ ...prev, operationalEnd: val }))}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                </div>
                <div className="input-group">
                    <label>Timezone</label>
                    <Select
                        options={[
                            { value: 'Asia/Jakarta', label: 'Asia/Jakarta — WIB (UTC+7)' },
                            { value: 'Asia/Makassar', label: 'Asia/Makassar — WITA (UTC+8)' },
                            { value: 'Asia/Jayapura', label: 'Asia/Jayapura — WIT (UTC+9)' },
                        ]}
                        value={systemSettingsForm.operationalTimezone}
                        onChange={(val) => setSystemSettingsForm((prev) => ({ ...prev, operationalTimezone: val }))}
                        clearable={false}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                        variant="white"
                    />
                </div>

                <div className="set-section-label" style={{ marginTop: 16 }}>Auto Reply</div>
                <div className="input-group">
                    <label>Di luar jam operasional</label>
                    <textarea
                        className="input-field"
                        rows={4}
                        value={systemSettingsForm.outsideOfficeReply}
                        onChange={(e) => setSystemSettingsForm((prev) => ({ ...prev, outsideOfficeReply: e.target.value }))}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                    <p className="settings-help">
                        Placeholder: <code>{'{{leadCode}}'}</code> untuk kode lead, <code>{'{{leadName}}'}</code> untuk nama customer.
                    </p>
                </div>
                <div className="input-group">
                    <label>Saat jam operasional</label>
                    <textarea
                        className="input-field"
                        rows={4}
                        value={systemSettingsForm.insideOfficeReply}
                        onChange={(e) => setSystemSettingsForm((prev) => ({ ...prev, insideOfficeReply: e.target.value }))}
                        disabled={systemSettingsLoading || systemSettingsSaving}
                    />
                    <p className="settings-help">
                        Contoh: <code>{'Kode Lead: {{leadCode}}'}</code>.
                    </p>
                </div>

                {systemSettingsError ? <p className="settings-error">{systemSettingsError}</p> : null}
                {systemSettingsFeedback ? <p className="settings-success">{systemSettingsFeedback}</p> : null}

                <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={systemSettingsLoading || systemSettingsSaving}
                    style={{ marginTop: 12 }}
                >
                    {systemSettingsSaving ? 'Menyimpan...' : 'Simpan Settings'}
                </button>
            </form>
        </div>
    );
}
