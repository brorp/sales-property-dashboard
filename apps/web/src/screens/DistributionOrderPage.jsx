'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import SelectFilter from '../components/SelectFilter';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';
import './SettingsPage.css';

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
    const [compensatingItem, setCompensatingItem] = useState(null);
    const [compensatingPenaltyId, setCompensatingPenaltyId] = useState(null);
    const [compensatingPenaltyLoading, setCompensatingPenaltyLoading] = useState(false);
    const [compensationReason, setCompensationReason] = useState('');
    const [submittingCompensation, setSubmittingCompensation] = useState(false);
    const [queuePreview, setQueuePreview] = useState({
        isRolledByActiveDistribution: false,
        rolledSalesIds: [],
        liveOffers: [],
        hasLiveOffer: false,
        isQueueLocked: false,
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
            rolledSalesIds: Array.isArray(payload?.queuePreview?.rolledSalesIds) ? payload.queuePreview.rolledSalesIds : [],
            liveOffers: Array.isArray(payload?.queuePreview?.liveOffers) ? payload.queuePreview.liveOffers : [],
            hasLiveOffer: Boolean(payload?.queuePreview?.hasLiveOffer),
            isQueueLocked: Boolean(payload?.queuePreview?.isQueueLocked),
        };
        setQueueRows(normalizedQueue);
        setAvailableSales(normalizedAvailable);
        setBlockedSales(normalizedBlocked);
        setQueuePreview(nextPreview);
        setQueueInitialSignature(buildQueueSignature(normalizedQueue));
        setSelectedSalesId((prev) => {
            if (!prev) return normalizedAvailable[0]?.id || '';
            return normalizedAvailable.some((item) => item.id === prev) ? prev : normalizedAvailable[0]?.id || '';
        });
        setSelectedInsertOrder('end');
    }, [buildQueueSignature, normalizeAvailableSales, normalizeQueueRows]);

    const loadQueueRows = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) { setQueueLoading(true); setQueueError(''); }
        try {
            const data = await apiRequest('/api/sales/queue', { user });
            applyQueueState(data);
        } catch (err) {
            if (!silent) setQueueError(err instanceof Error ? err.message : 'Failed loading sales queue');
        } finally {
            if (!silent) setQueueLoading(false);
        }
    }, [applyQueueState, user]);

    useEffect(() => {
        void loadQueueRows();
    }, [loadQueueRows]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            if (queueDirty || queueSaving || queueMutating) return;
            await loadQueueRows({ silent: true });
        },
    });

    const moveQueueItem = (index, direction) => {
        if (queuePreview?.isQueueLocked) {
            setQueueError('Distribution order sedang terkunci karena ada live offer menunggu OK.');
            return;
        }
        setQueueRows((prev) => {
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
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
        if (!user || queueRows.length === 0) return;
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
        if (!user || !selectedSalesId) return;
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

    const updateRepeatOrder = async (salesId, repeatOrderRemaining) => {
        if (!user || !salesId) return;
        setQueueMutating(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const data = await apiRequest(`/api/sales/queue/${salesId}/repeat-order`, {
                method: 'PATCH',
                user,
                body: { repeatOrderRemaining: Number(repeatOrderRemaining) },
            });
            applyQueueState(data);
            setQueueFeedback('Reward repeat order berhasil diperbarui.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed updating repeat order reward');
        } finally {
            setQueueMutating(false);
        }
    };

    const removeSalesFromQueue = async (salesId) => {
        if (!user || !salesId) return;
        const confirmed = window.confirm('Hapus sales ini dari distribution order?');
        if (!confirmed) return;
        setQueueMutating(true);
        setQueueError('');
        setQueueFeedback('');
        try {
            const data = await apiRequest(`/api/sales/queue/${salesId}`, { method: 'DELETE', user });
            applyQueueState(data);
            setQueueFeedback('Sales berhasil dihapus dari distribution order.');
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Failed removing sales from queue');
        } finally {
            setQueueMutating(false);
        }
    };

    const openCompensateModal = async (item) => {
        setCompensatingItem(item);
        setCompensationReason('');
        setCompensatingPenaltyId(null);
        setQueueError('');
        setCompensatingPenaltyLoading(true);
        try {
            const rows = await apiRequest('/api/penalties', { user });
            const active = (Array.isArray(rows) ? rows : []).find(
                (p) => p.salesId === item.id && p.status === 'active'
            );
            if (active) {
                setCompensatingPenaltyId(active.id);
            } else {
                setQueueError('Tidak ada penalty aktif ditemukan untuk sales ini.');
                setCompensatingItem(null);
            }
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Gagal memuat data penalty');
            setCompensatingItem(null);
        } finally {
            setCompensatingPenaltyLoading(false);
        }
    };

    const handleCompensatePenalty = async () => {
        if (!user || !compensatingItem || !compensatingPenaltyId) return;
        if (!compensationReason.trim()) { setQueueError('Alasan kompensasi wajib diisi.'); return; }
        setSubmittingCompensation(true);
        setQueueError(''); setQueueFeedback('');
        try {
            await apiRequest(`/api/penalties/${compensatingPenaltyId}/compensate`, {
                method: 'POST', user, body: { reason: compensationReason.trim() },
            });
            setQueueFeedback(`Penalty untuk ${compensatingItem.name} berhasil dikompensasi.`);
            setCompensatingItem(null);
            setCompensatingPenaltyId(null);
            setCompensationReason('');
            await loadQueueRows({ silent: true });
        } catch (err) {
            setQueueError(err instanceof Error ? err.message : 'Gagal mengompensasi penalty');
        } finally {
            setSubmittingCompensation(false);
        }
    };

    const queueDirty = buildQueueSignature(queueRows) !== queueInitialSignature;
    const queueLocked = Boolean(queuePreview?.isQueueLocked);
    const rewardOptions = [0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}x` }));

    const salesOptions = useMemo(() => availableSales.map((s) => ({ value: s.id, label: s.name })), [availableSales]);
    const insertOrderOptions = useMemo(() => [
        { value: 'end', label: 'Posisi paling bawah' },
        ...Array.from({ length: queueRows.length }, (_, i) => ({ value: String(i + 1), label: `Sisipkan di posisi ${i + 1}` })),
    ], [queueRows.length]);
    const queuePreviewMessage = useMemo(() => {
        if (!queuePreview?.hasLiveOffer && !queuePreview?.isRolledByActiveDistribution) return '';
        const liveOffers = Array.isArray(queuePreview.liveOffers) ? queuePreview.liveOffers : [];
        if (liveOffers.length === 0) {
            return queuePreview?.isQueueLocked
                ? 'Urutan distribusi sedang terkunci karena ada penawaran aktif menunggu OK.'
                : 'Urutan di bawah sudah diproyeksikan sebagai sesi distribusi berikutnya.';
        }
        const primaryOffer = liveOffers[0];
        const deadlineLabel = primaryOffer?.ackDeadline
            ? new Date(primaryOffer.ackDeadline).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : null;
        const suffix = liveOffers.length > 1 ? ` dan ${liveOffers.length - 1} offer lain` : '';
        const rewardCopy = primaryOffer?.isRewardLocked
            ? ` Reward repeat masih aktif ${primaryOffer.repeatOrderRemaining}x, antrian ditahan sampai outcome jelas.`
            : '';
        return `${primaryOffer?.salesName || 'Sales aktif'} sedang menunggu balasan OK${primaryOffer?.leadName ? ` untuk ${primaryOffer.leadName}` : ''}${deadlineLabel ? ` sampai ${deadlineLabel}` : ''}${suffix}. Urutan distribusi dikunci sementara.${rewardCopy}`;
    }, [queuePreview]);

    return (
        <div className="page-container set-page">
            <Header title="Urutan Distribusi" showBack />

            {queuePreview?.hasLiveOffer ? (
                <div className="distribution-live-banner">
                    <div>
                        <span className="badge badge-danger">Penawaran Aktif</span>
                    </div>
                    <div className="distribution-live-banner-copy">
                        {queuePreviewMessage || 'Ada distribusi lead yang sedang menunggu balasan OK. Jangan edit atau hapus distribution order sampai offer selesai.'}
                    </div>
                </div>
            ) : null}

            <div className="set-card">
                <p className="settings-help">
                    Urutan ini dipakai untuk distribusi lead otomatis. Begitu bot mengirim offer ke sales, urutan sesi berikutnya langsung diproyeksikan secara realtime.
                </p>
                {queuePreviewMessage ? (
                    <div className={`settings-live-offer ${queueLocked ? 'is-locked' : ''}`} style={{ marginTop: 10 }}>
                        {queuePreviewMessage}
                    </div>
                ) : null}
                {blockedSales.length > 0 ? (
                    <p className="settings-help" style={{ marginTop: 10 }}>
                        Sales yang sedang terkena penalti aktif tidak bisa ditambahkan ke antrian sampai masa blokir berakhir.
                    </p>
                ) : null}

                <div className="input-group" style={{ marginTop: 16 }}>
                    <label>Tambah Sales ke Antrian</label>
                    <div className="settings-inline-grid">
                        <SelectFilter
                            options={salesOptions}
                            value={selectedSalesId}
                            onChange={(v) => setSelectedSalesId(v || '')}
                            placeholder={availableSales.length === 0 ? 'Semua sales sudah masuk antrian' : 'Pilih sales...'}
                            disabled={queueLoading || queueSaving || queueMutating || queueLocked || availableSales.length === 0}
                            clearable={false}
                        />
                        <SelectFilter
                            options={insertOrderOptions}
                            value={selectedInsertOrder}
                            onChange={(v) => setSelectedInsertOrder(v || 'end')}
                            placeholder="Posisi paling bawah"
                            disabled={queueLoading || queueSaving || queueMutating || queueLocked}
                            clearable={false}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={addSalesToQueue}
                        disabled={queueLoading || queueSaving || queueMutating || queueLocked || !selectedSalesId}
                    >
                        {queueMutating ? 'Menyimpan...' : 'Tambah ke Antrian'}
                    </button>
                </div>

                {blockedSales.length > 0 ? (
                    <div className="settings-queue-list" style={{ marginTop: 18 }}>
                        {blockedSales.map((item) => (
                            <div key={item.id} className="settings-queue-item settings-queue-item--blocked" style={{ opacity: 0.84 }}>
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
                                <span className="badge badge-danger" style={{ flexShrink: 0 }}>Penalty #{item.suspension?.penaltySequence || item.suspension?.penaltyLayer || '-'}</span>
                                {item.isSuspended ? (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary settings-queue-compensate-btn"
                                        onClick={() => void openCompensateModal(item)}
                                        disabled={compensatingPenaltyLoading}
                                    >
                                        Kompensasi Penalty
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="set-card">
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
                                    <div className="settings-queue-reward">
                                        <span>Pengulangan</span>
                                        <div style={{ width: 88 }}>
                                            <SelectFilter
                                                options={rewardOptions}
                                                value={String(Number(item.repeatOrderRemaining || 0))}
                                                onChange={(v) => void updateRepeatOrder(item.id, v || '0')}
                                                disabled={queueSaving || queueMutating || queueLocked}
                                                clearable={false}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'up')}
                                        disabled={queueSaving || queueMutating || queueLocked || index === 0}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => moveQueueItem(index, 'down')}
                                        disabled={queueSaving || queueMutating || queueLocked || index === queueRows.length - 1}
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn settings-queue-remove"
                                        onClick={() => void removeSalesFromQueue(item.id)}
                                        disabled={queueSaving || queueMutating || queueLocked}
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
                    disabled={queueLoading || queueSaving || queueMutating || queueLocked || !queueDirty || queueRows.length === 0}
                    onClick={saveQueueOrder}
                    style={{ marginTop: 12 }}
                >
                    {queueSaving ? 'Menyimpan...' : 'Simpan Urutan Distribusi'}
                </button>
            </div>

            {compensatingItem ? (
                <div className="sheet-overlay" onClick={() => setCompensatingItem(null)}>
                    <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="sheet-handle" />
                        <h2>Kompensasi Penalty</h2>
                        <p className="settings-help">
                            Penalty untuk <strong>{compensatingItem.name}</strong> akan tetap tersimpan di history, tetapi tidak lagi dihitung untuk blocking dan eskalasi.
                        </p>
                        <div className="input-group" style={{ marginTop: 16 }}>
                            <label>Alasan Kompensasi</label>
                            <textarea
                                className="input-field"
                                rows={5}
                                value={compensationReason}
                                onChange={(e) => setCompensationReason(e.target.value)}
                                placeholder="Contoh: kesalahan sistem / kondisi darurat"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setCompensatingItem(null)} disabled={submittingCompensation}>
                                Batal
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => void handleCompensatePenalty()} disabled={submittingCompensation}>
                                {submittingCompensation ? 'Menyimpan...' : 'Kompensasi'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
