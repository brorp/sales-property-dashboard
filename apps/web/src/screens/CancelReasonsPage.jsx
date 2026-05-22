'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import './SettingsPage.css';

const IconPencil = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const IconTrash = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
);

const initialForm = { code: '', label: '', sortOrder: '0', isActive: true };

export default function CancelReasonsPage() {
    const { user } = useAuth();
    const [cancelReasons, setCancelReasons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [reasonToDelete, setReasonToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const loadCancelReasons = useCallback(async () => {
        if (!user) return;
        setError('');
        try {
            const rows = await apiRequest('/api/cancel-reasons', { user });
            setCancelReasons(Array.isArray(rows) ? rows : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading cancel reasons');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadCancelReasons();
    }, [loadCancelReasons]);

    const sortedCancelReasons = useMemo(() => {
        return [...cancelReasons].sort((a, b) => {
            const diff = Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0);
            if (diff !== 0) return diff;
            return String(a?.label || '').localeCompare(String(b?.label || ''));
        });
    }, [cancelReasons]);

    const openAddModal = () => {
        setEditingId('');
        setForm(initialForm);
        setError('');
        setIsModalOpen(true);
    };

    const openEditModal = (item) => {
        setEditingId(item.id);
        setForm({
            code: item.code || '',
            label: item.label || '',
            sortOrder: String(item.sortOrder ?? 0),
            isActive: Boolean(item.isActive),
        });
        setError('');
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId('');
        setForm(initialForm);
        setError('');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!user) return;
        setSaving(true);
        setError('');
        try {
            const payload = {
                code: form.code,
                label: form.label,
                sortOrder: Number(form.sortOrder || 0),
                isActive: Boolean(form.isActive),
            };
            if (editingId) {
                await apiRequest(`/api/cancel-reasons/${editingId}`, { method: 'PATCH', user, body: payload });
                setFeedback('Cancel reason berhasil diupdate.');
            } else {
                await apiRequest('/api/cancel-reasons', { method: 'POST', user, body: payload });
                setFeedback('Cancel reason berhasil ditambahkan.');
            }
            handleCloseModal();
            await loadCancelReasons();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving cancel reason');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!user || !reasonToDelete) return;
        setDeleting(true);
        setFeedback('');
        try {
            await apiRequest(`/api/cancel-reasons/${reasonToDelete.id}`, { method: 'DELETE', user });
            setFeedback('Cancel reason berhasil dihapus.');
            setReasonToDelete(null);
            await loadCancelReasons();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting cancel reason');
            setReasonToDelete(null);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="page-container set-page">
            <Header title="Kelola Cancel Reason" showBack />

            <div className="set-card">
                <div className="settings-header">
                    <h3 className="set-card-title" style={{ margin: 0 }}>Daftar Cancel Reason</h3>
                    <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
                        + Tambah Reason
                    </button>
                </div>

                {loading ? <p className="settings-help">Loading cancel reasons...</p> : null}

                {!loading && sortedCancelReasons.length === 0 ? (
                    <p className="settings-help">Belum ada cancel reason untuk client ini. Klik Tambah Reason untuk memulai.</p>
                ) : null}

                {!loading && sortedCancelReasons.length > 0 ? (
                    <div className="settings-queue-list">
                        {sortedCancelReasons.map((item) => (
                            <div key={item.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">{Number(item.sortOrder || 0)}</span>
                                    <div>
                                        <div className="settings-queue-name">{item.label}</div>
                                        <div className="settings-queue-meta">
                                            {item.code} • {item.isActive ? 'Aktif' : 'Nonaktif'}
                                        </div>
                                    </div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--edit"
                                        onClick={() => openEditModal(item)}
                                        disabled={saving || deleting}
                                        title="Edit cancel reason"
                                    >
                                        <IconPencil />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--danger"
                                        onClick={() => setReasonToDelete(item)}
                                        disabled={saving || deleting}
                                        title="Hapus cancel reason"
                                    >
                                        <IconTrash />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}

                {error && !isModalOpen ? <p className="settings-error">{error}</p> : null}
                {feedback ? <p className="settings-success">{feedback}</p> : null}
            </div>

            {/* Form Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingId ? 'Edit Cancel Reason' : 'Tambah Cancel Reason'}
            >
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Code</label>
                        <input
                            className="input-field"
                            value={form.code}
                            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                            placeholder="Contoh: harga_tidak_masuk"
                            disabled={saving}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="input-group">
                        <label>Label</label>
                        <input
                            className="input-field"
                            value={form.label}
                            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                            placeholder="Contoh: Harga Tidak Masuk"
                            disabled={saving}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Sort Order</label>
                        <input
                            type="number"
                            className="input-field"
                            value={form.sortOrder}
                            onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                            disabled={saving}
                        />
                    </div>
                    <label className="cr-toggle">
                        <span className="cr-toggle-label">Aktif</span>
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                            disabled={saving}
                        />
                        <div className="cr-toggle-track">
                            <div className="cr-toggle-thumb" />
                        </div>
                    </label>

                    {error ? <p className="settings-error">{error}</p> : null}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={saving}>
                            Batal
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingId ? 'Update Reason' : 'Tambah Reason'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={Boolean(reasonToDelete)}
                onClose={() => setReasonToDelete(null)}
                title="Hapus Cancel Reason"
            >
                <p style={{ margin: 0, color: '#374151', fontSize: '0.9375rem' }}>
                    Hapus cancel reason <strong style={{ color: '#1E3A5F' }}>{reasonToDelete?.label}</strong>? Tindakan ini tidak bisa dibatalkan.
                </p>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setReasonToDelete(null)} disabled={deleting}>
                        Batal
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleConfirmDelete} disabled={deleting}>
                        {deleting ? 'Menghapus...' : 'Hapus'}
                    </button>
                </div>
            </Modal>
        </div>
    );
}
