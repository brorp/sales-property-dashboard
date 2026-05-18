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

const initialForm = { unitName: '' };

export default function UnitsPage() {
    const { user } = useAuth();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [unitToDelete, setUnitToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    const loadUnits = useCallback(async () => {
        if (!user) return;
        setError('');
        try {
            const rows = await apiRequest('/api/units', { user });
            setUnits(Array.isArray(rows) ? rows : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading units');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadUnits();
    }, [loadUnits]);

    const sortedUnits = useMemo(() => {
        return [...units].sort((a, b) => String(a?.unitName || '').localeCompare(String(b?.unitName || '')));
    }, [units]);

    const openAddModal = () => {
        setEditingId('');
        setForm(initialForm);
        setError('');
        setIsModalOpen(true);
    };

    const openEditModal = (unit) => {
        setEditingId(unit.id);
        setForm({ unitName: unit.unitName || '' });
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
            if (editingId) {
                await apiRequest(`/api/units/${editingId}`, { method: 'PATCH', user, body: form });
                setFeedback('Unit berhasil diupdate.');
            } else {
                await apiRequest('/api/units', { method: 'POST', user, body: form });
                setFeedback('Unit berhasil ditambahkan.');
            }
            handleCloseModal();
            await loadUnits();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving unit');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!user || !unitToDelete) return;
        setDeleting(true);
        setFeedback('');
        try {
            await apiRequest(`/api/units/${unitToDelete.id}`, { method: 'DELETE', user });
            setFeedback('Unit berhasil dihapus.');
            setUnitToDelete(null);
            await loadUnits();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting unit');
            setUnitToDelete(null);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="page-container set-page">
            <Header title="Kelola Unit" showBack />

            <div className="set-card">
                <div className="settings-header">
                    <h3 className="set-card-title" style={{ margin: 0 }}>Daftar Unit</h3>
                    <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
                        + Tambah Unit
                    </button>
                </div>

                {loading ? <p className="settings-help">Loading unit...</p> : null}

                {!loading && sortedUnits.length === 0 ? (
                    <p className="settings-help">Belum ada unit yang terdaftar. Klik Tambah Unit untuk memulai.</p>
                ) : null}

                {!loading && sortedUnits.length > 0 ? (
                    <div className="settings-queue-list">
                        {sortedUnits.map((unit) => (
                            <div key={unit.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">{String(unit.unitName || '?').charAt(0).toUpperCase()}</span>
                                    <div className="settings-queue-name">{unit.unitName}</div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--edit"
                                        onClick={() => openEditModal(unit)}
                                        disabled={saving || deleting}
                                        title="Edit unit"
                                    >
                                        <IconPencil />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--danger"
                                        onClick={() => setUnitToDelete(unit)}
                                        disabled={saving || deleting}
                                        title="Hapus unit"
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
                title={editingId ? 'Edit Unit' : 'Tambah Unit'}
            >
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Nama Unit</label>
                        <input
                            className="input-field"
                            value={form.unitName}
                            onChange={(e) => setForm((prev) => ({ ...prev, unitName: e.target.value }))}
                            placeholder="Contoh: Aster, Type 72, Loft Corner"
                            disabled={saving}
                            required
                            autoFocus
                        />
                    </div>

                    {error ? <p className="settings-error">{error}</p> : null}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={saving}>
                            Batal
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingId ? 'Update Unit' : 'Tambah Unit'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={Boolean(unitToDelete)}
                onClose={() => setUnitToDelete(null)}
                title="Hapus Unit"
            >
                <p style={{ margin: 0, color: '#374151', fontSize: '0.9375rem' }}>
                    Hapus unit <strong style={{ color: '#1E3A5F' }}>{unitToDelete?.unitName}</strong>? Tindakan ini tidak bisa dibatalkan.
                </p>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setUnitToDelete(null)} disabled={deleting}>
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
