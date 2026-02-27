'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export default function DistributionOrderPage() {
    const { user } = useAuth();
    const [queueRows, setQueueRows] = useState([]);
    const [queueLoading, setQueueLoading] = useState(true);
    const [queueSaving, setQueueSaving] = useState(false);
    const [queueError, setQueueError] = useState('');
    const [queueFeedback, setQueueFeedback] = useState('');
    const [queueInitialSignature, setQueueInitialSignature] = useState('');

    const normalizeQueueRows = useCallback((rows) => {
        return (Array.isArray(rows) ? rows : [])
            .filter(
                (item) =>
                    item?.id &&
                    item?.role === 'sales' &&
                    Number(item?.queueOrder) > 0
            )
            .sort((a, b) => {
                const aOrder = Number(a?.queueOrder || 9999);
                const bOrder = Number(b?.queueOrder || 9999);
                if (aOrder !== bOrder) return aOrder - bOrder;
                return String(a?.name || '').localeCompare(String(b?.name || ''));
            });
    }, []);

    const buildQueueSignature = useCallback((rows) => {
        return rows.map((item) => item.id).join('|');
    }, []);

    const loadQueueRows = useCallback(async () => {
        if (!user) {
            return;
        }
        setQueueLoading(true);
        setQueueError('');
        try {
            const rows = await apiRequest('/api/sales', { user });
            const normalized = normalizeQueueRows(rows);
            setQueueRows(normalized);
            setQueueInitialSignature(buildQueueSignature(normalized));
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed loading sales queue');
        } finally {
            setQueueLoading(false);
        }
    }, [buildQueueSignature, normalizeQueueRows, user]);

    useEffect(() => {
        void loadQueueRows();
    }, [loadQueueRows]);

    const moveQueueItem = (index, direction) => {
        setQueueRows((prev) => {
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= prev.length) {
                return prev;
            }
            const next = [...prev];
            const temp = next[index];
            next[index] = next[nextIndex];
            next[nextIndex] = temp;
            return next;
        });
        setQueueFeedback('');
        setQueueError('');
    };

    const saveQueueOrder = async () => {
        if (!user || queueRows.length === 0) {
            return;
        }

        const salesIds = queueRows.map((item) => item.id);
        setQueueSaving(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const rows = await apiRequest('/api/sales/queue/reorder', {
                method: 'PATCH',
                user,
                body: { salesIds },
            });
            const normalized = normalizeQueueRows(rows);
            setQueueRows(normalized);
            setQueueInitialSignature(buildQueueSignature(normalized));
            setQueueFeedback('Urutan distribusi sales berhasil disimpan.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed saving queue order');
        } finally {
            setQueueSaving(false);
        }
    };

    const queueDirty = buildQueueSignature(queueRows) !== queueInitialSignature;

    return (
        <div className="page-container">
            <Header
                title="Distribution Order"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadQueueRows()} disabled={queueLoading || queueSaving}>
                        {queueLoading ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            <div className="card settings-card">
                <p className="settings-help">
                    Atur urutan distribusi sales. Setelah sales berhasil claim lead, sistem otomatis memindahkan sales tersebut ke urutan paling belakang.
                </p>

                {queueLoading ? <p className="settings-help">Loading queue...</p> : null}

                {!queueLoading && queueRows.length === 0 ? (
                    <p className="settings-help">Belum ada sales aktif di queue.</p>
                ) : null}

                {!queueLoading && queueRows.length > 0 ? (
                    <div className="settings-queue-list">
                        {queueRows.map((item, index) => (
                            <div key={item.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">#{index + 1}</span>
                                    <div>
                                        <div className="settings-queue-name">{item.name}</div>
                                        <div className="settings-queue-meta">{item.email}</div>
                                    </div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'up')}
                                        disabled={queueSaving || index === 0}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'down')}
                                        disabled={queueSaving || index === queueRows.length - 1}
                                    >
                                        ↓
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}

                {queueError ? <p className="settings-error">{queueError}</p> : null}
                {queueFeedback ? <p className="settings-success">{queueFeedback}</p> : null}

                <button
                    type="button"
                    className="btn btn-primary btn-full"
                    disabled={queueLoading || queueSaving || !queueDirty || queueRows.length === 0}
                    onClick={saveQueueOrder}
                    style={{ marginTop: 10 }}
                >
                    {queueSaving ? 'Menyimpan...' : 'Simpan Urutan Distribusi'}
                </button>
            </div>
        </div>
    );
}
