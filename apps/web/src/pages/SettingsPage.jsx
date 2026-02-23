'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';

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
    const apiBase = useMemo(
        () => (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
        []
    );
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN || '';

    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

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

    const loadStatus = useCallback(async () => {
        try {
            const data = await request('/status');
            setState(data);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading status');
        } finally {
            setLoading(false);
        }
    }, [request]);

    useEffect(() => {
        void loadStatus();
        const timer = setInterval(() => void loadStatus(), 3000);
        return () => clearInterval(timer);
    }, [loadStatus]);

    const runAction = async (path) => {
        setActionLoading(true);
        try {
            const data = await request(path, 'POST');
            setState(data);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="page-container">
            <Header title="WhatsApp Settings" showBack />

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
                    <p className="settings-help">Belum ada QR aktif. Klik Start / Restart untuk generate session baru.</p>
                ) : null}
            </div>

            <div className="card settings-card">
                <h3>Session Actions</h3>
                <div className="settings-actions">
                    <button className="btn btn-primary" disabled={actionLoading} onClick={() => void runAction('/start')}>Start</button>
                    <button className="btn btn-secondary" disabled={actionLoading} onClick={() => void runAction('/restart')}>Restart</button>
                    <button className="btn btn-secondary" disabled={actionLoading} onClick={() => void runAction('/stop')}>Stop</button>
                    <button className="btn btn-danger" disabled={actionLoading} onClick={() => void runAction('/reset')}>Reset Session</button>
                </div>
                <p className="settings-help">Reset Session akan menghapus auth lama dan membuat sesi login WhatsApp baru.</p>
            </div>
        </div>
    );
}
