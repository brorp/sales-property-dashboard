'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';

export default function DistributionOrderPage() {
    const { user } = useAuth();
    const [queueRows, setQueueRows] = useState([]);
    const [availableSales, setAvailableSales] = useState([]);
    const [blockedSales, setBlockedSales] = useState([]);
    const [queueLoading, setQueueLoading] = useState(true);
    const [queueSaving, setQueueSaving] = useState(false);
    const [queueMutating, setQueueMutating] = useState(false);
    const [queueError, setQueueError] = useState('');
    const [queueFeedback, setQueueFeedback] = useState('');
    const [queueInitialSignature, setQueueInitialSignature] = useState('');
    const [selectedSalesId, setSelectedSalesId] = useState('');
    const [selectedInsertOrder, setSelectedInsertOrder] = useState('end');
    const [queuePreview, setQueuePreview] = useState({
        isRolledByActiveDistribution: false,
        rolledSalesIds: [],
        liveOffers: [],
    });

    const normalizeQueueRows = useCallback((rows) => {
        return (Array.isArray(rows) ? rows : [])
            .filter((item) => item?.id && Number(item?.queueOrder) > 0)
            .sort((a, b) => {
                const aOrder = Number(a?.queueOrder || 9999);
                const bOrder = Number(b?.queueOrder || 9999);
                if (aOrder !== bOrder) return aOrder - bOrder;
                return String(a?.name || '').localeCompare(String(b?.name || ''));
            });
    }, []);

    const normalizeAvailableSales = useCallback((rows) => {
        return (Array.isArray(rows) ? rows : [])
            .filter((item) => item?.id)
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    }, []);

    const buildQueueSignature = useCallback((rows) => {
        return rows.map((item) => item.id).join('|');
    }, []);

    const applyQueueState = useCallback((payload) => {
        const normalizedQueue = normalizeQueueRows(payload?.queueRows);
        const normalizedAvailable = normalizeAvailableSales(payload?.availableSales);
        const normalizedBlocked = normalizeAvailableSales(payload?.blockedSales);
        const nextPreview = {
            isRolledByActiveDistribution: Boolean(payload?.queuePreview?.isRolledByActiveDistribution),
            rolledSalesIds: Array.isArray(payload?.queuePreview?.rolledSalesIds)
                ? payload.queuePreview.rolledSalesIds
                : [],
            liveOffers: Array.isArray(payload?.queuePreview?.liveOffers)
                ? payload.queuePreview.liveOffers
                : [],
        };
        setQueueRows(normalizedQueue);
        setAvailableSales(normalizedAvailable);
        setBlockedSales(normalizedBlocked);
        setQueuePreview(nextPreview);
        setQueueInitialSignature(buildQueueSignature(normalizedQueue));
        setSelectedSalesId((prev) => {
            if (!prev) {
                return normalizedAvailable[0]?.id || '';
            }
            return normalizedAvailable.some((item) => item.id === prev)
                ? prev
                : normalizedAvailable[0]?.id || '';
        });
        setSelectedInsertOrder('end');
    }, [buildQueueSignature, normalizeAvailableSales, normalizeQueueRows]);

    const loadQueueRows = useCallback(async ({ silent = false } = {}) => {
        if (!user) {
            return;
        }
        if (!silent) {
            setQueueLoading(true);
            setQueueError('');
        }
        try {
            const data = await apiRequest('/api/sales/queue', { user });
            applyQueueState(data);
        } catch (err) {
            if (!silent) {
                setQueueError(err instanceof Error ? err.message : 'Failed loading sales queue');
            }
        } finally {
            if (!silent) {
                setQueueLoading(false);
            }
        }
    }, [applyQueueState, user]);

    useEffect(() => {
        void loadQueueRows();
    }, [loadQueueRows]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            if (queueDirty || queueSaving || queueMutating) {
                return;
            }
            await loadQueueRows({ silent: true });
        },
    });

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

        setQueueSaving(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const data = await apiRequest('/api/sales/queue/reorder', {
                method: 'PATCH',
                user,
                body: { salesIds: queueRows.map((item) => item.id) },
            });
            applyQueueState(data);
            setQueueFeedback('Urutan distribusi berhasil disimpan.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed saving queue order');
        } finally {
            setQueueSaving(false);
        }
    };

    const addSalesToQueue = async () => {
        if (!user || !selectedSalesId) {
            return;
        }

        setQueueMutating(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const data = await apiRequest('/api/sales/queue', {
                method: 'POST',
                user,
                body: {
                    salesId: selectedSalesId,
                    queueOrder: selectedInsertOrder === 'end' ? null : Number(selectedInsertOrder),
                },
            });
            applyQueueState(data);
            setQueueFeedback('Sales berhasil ditambahkan ke distribution order.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed adding sales to queue');
        } finally {
            setQueueMutating(false);
        }
    };

    const removeSalesFromQueue = async (salesId) => {
        if (!user || !salesId) {
            return;
        }

        const confirmed = window.confirm('Hapus sales ini dari distribution order?');
        if (!confirmed) {
            return;
        }

        setQueueMutating(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const data = await apiRequest(`/api/sales/queue/${salesId}`, {
                method: 'DELETE',
                user,
            });
            applyQueueState(data);
            setQueueFeedback('Sales berhasil dihapus dari distribution order.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed removing sales from queue');
        } finally {
            setQueueMutating(false);
        }
    };

    const queueDirty = buildQueueSignature(queueRows) !== queueInitialSignature;
    const insertOrderOptions = useMemo(() => {
        return Array.from({ length: queueRows.length + 1 }, (_, index) => index + 1);
    }, [queueRows.length]);
    const queuePreviewMessage = useMemo(() => {
        if (!queuePreview?.isRolledByActiveDistribution) {
            return '';
        }

        const liveOffers = Array.isArray(queuePreview.liveOffers) ? queuePreview.liveOffers : [];
        if (liveOffers.length === 0) {
            return 'Urutan di bawah sudah diproyeksikan sebagai sesi distribusi berikutnya.';
        }

        const primaryOffer = liveOffers[0];
        const deadlineLabel = primaryOffer?.ackDeadline
            ? new Date(primaryOffer.ackDeadline).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
            })
            : null;
        const suffix = liveOffers.length > 1 ? ` dan ${liveOffers.length - 1} offer lain` : '';

        return `Urutan di bawah sudah diproyeksikan ke sesi berikutnya. ${primaryOffer?.salesName || 'Sales aktif'} sedang menunggu balasan OK${primaryOffer?.leadName ? ` untuk ${primaryOffer.leadName}` : ''}${deadlineLabel ? ` sampai ${deadlineLabel}` : ''}${suffix}.`;
    }, [queuePreview]);

    return (
        <div className="page-container">
            <Header title="Distribution Order" showBack />

            <div className="card settings-card">
                <p className="settings-help">
                    Urutan ini dipakai untuk distribusi lead otomatis. Begitu bot mengirim offer ke sales, urutan sesi berikutnya langsung diproyeksikan secara realtime.
                </p>
                {queuePreviewMessage ? (
                    <div className="settings-help" style={{ marginTop: 10 }}>
                        {queuePreviewMessage}
                    </div>
                ) : null}
                {blockedSales.length > 0 ? (
                    <div className="settings-help" style={{ marginTop: 10 }}>
                        Sales yang sedang terkena penalty aktif tidak bisa ditambahkan ke queue sampai masa block berakhir.
                    </div>
                ) : null}

                <div className="input-group" style={{ marginTop: 16 }}>
                    <label>Tambah Sales ke Queue</label>
                    <div className="settings-inline-grid">
                        <select
                            className="input-field"
                            value={selectedSalesId}
                            onChange={(event) => setSelectedSalesId(event.target.value)}
                            disabled={queueLoading || queueSaving || queueMutating || availableSales.length === 0}
                        >
                            {availableSales.length === 0 ? (
                                <option value="">Semua sales sudah masuk queue</option>
                            ) : null}
                            {availableSales.map((sales) => (
                                <option key={sales.id} value={sales.id}>
                                    {sales.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="input-field"
                            value={selectedInsertOrder}
                            onChange={(event) => setSelectedInsertOrder(event.target.value)}
                            disabled={queueLoading || queueSaving || queueMutating}
                        >
                            <option value="end">Posisi paling bawah</option>
                            {insertOrderOptions.map((order) => (
                                <option key={order} value={String(order)}>
                                    Sisipkan di posisi {order}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={addSalesToQueue}
                        disabled={queueLoading || queueSaving || queueMutating || !selectedSalesId}
                    >
                        {queueMutating ? 'Menyimpan...' : 'Tambah ke Queue'}
                    </button>
                </div>

                {blockedSales.length > 0 ? (
                    <div className="settings-queue-list" style={{ marginTop: 18 }}>
                        {blockedSales.map((item) => (
                            <div key={item.id} className="settings-queue-item" style={{ opacity: 0.84 }}>
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">!</span>
                                    <div>
                                        <div className="settings-queue-name">{item.name}</div>
                                        <div className="settings-queue-meta">{item.email}</div>
                                        {item.suspension?.suspendedUntil ? (
                                            <div className="settings-queue-meta">
                                                Penalty aktif sampai {new Date(item.suspension.suspendedUntil).toLocaleString('id-ID')}
                                            </div>
                                        ) : null}
                                        {item.suspension?.spLevel && item.suspension.spLevel !== 'none' ? (
                                            <div className="settings-queue-meta">
                                                Surat peringatan: {String(item.suspension.spLevel).toUpperCase()}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                <span className="badge badge-danger">Penalty #{item.suspension?.penaltySequence || item.suspension?.penaltyLayer || '-'}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="card settings-card">
                {queueLoading ? <p className="settings-help">Loading queue...</p> : null}

                {!queueLoading && queueRows.length === 0 ? (
                    <p className="settings-help">Belum ada sales aktif di distribution order.</p>
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
                                        {item.phone ? <div className="settings-queue-meta">{item.phone}</div> : null}
                                    </div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'up')}
                                        disabled={queueSaving || queueMutating || index === 0}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'down')}
                                        disabled={queueSaving || queueMutating || index === queueRows.length - 1}
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn settings-queue-remove"
                                        onClick={() => void removeSalesFromQueue(item.id)}
                                        disabled={queueSaving || queueMutating}
                                    >
                                        Hapus
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
                    disabled={queueLoading || queueSaving || queueMutating || !queueDirty || queueRows.length === 0}
                    onClick={saveQueueOrder}
                    style={{ marginTop: 12 }}
                >
                    {queueSaving ? 'Menyimpan...' : 'Simpan Urutan Distribusi'}
                </button>
            </div>
        </div>
    );
}
