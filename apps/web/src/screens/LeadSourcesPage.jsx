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

const initialForm = { value: '' };

export default function LeadSourcesPage() {
    const { user } = useAuth();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sourceToDelete, setSourceToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const loadSources = useCallback(async () => {
        if (!user) return;
        setError('');
        try {
            const rows = await apiRequest('/api/lead-sources', { user });
            setSources(Array.isArray(rows) ? rows : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading lead sources');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadSources();
    }, [loadSources]);

    const sortedSources = useMemo(() => {
        return [...sources].sort((a, b) => String(a?.value || '').localeCompare(String(b?.value || '')));
    }, [sources]);

    const openAddModal = () => {
        setEditingId('');
        setForm(initialForm);
        setError('');
        setIsModalOpen(true);
    };

    const openEditModal = (source) => {
        setEditingId(source.id);
        setForm({ value: source.value || '' });
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
                await apiRequest(`/api/lead-sources/${editingId}`, { method: 'PATCH', user, body: form });
                setFeedback('Sumber lead berhasil diupdate.');
            } else {
                await apiRequest('/api/lead-sources', { method: 'POST', user, body: form });
                setFeedback('Sumber lead berhasil ditambahkan.');
            }
            handleCloseModal();
            await loadSources();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving lead source');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!user || !sourceToDelete) return;
        setDeleting(true);
        setFeedback('');
        try {
            await apiRequest(`/api/lead-sources/${sourceToDelete.id}`, { method: 'DELETE', user });
            setFeedback('Sumber lead berhasil dihapus.');
            setSourceToDelete(null);
            await loadSources();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting lead source');
            setSourceToDelete(null);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="page-container set-page">
            <Header title="Kelola Sumber Leads" showBack />

            <div className="set-card">
                <div className="settings-header">
                    <h3 className="set-card-title" style={{ margin: 0 }}>Daftar Sumber Lead</h3>
                    <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
                        + Tambah Source
                    </button>
                </div>

                {loading ? <p className="settings-help">Loading sumber leads...</p> : null}

                {!loading && sortedSources.length === 0 ? (
                    <p className="settings-help">Belum ada sumber leads untuk workspace ini. Klik Tambah Source untuk memulai.</p>
                ) : null}

                {!loading && sortedSources.length > 0 ? (
                    <div className="settings-queue-list">
                        {sortedSources.map((source) => (
                            <div key={source.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">{String(source.value || '?').charAt(0).toUpperCase()}</span>
                                    <div className="settings-queue-name">{source.value}</div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--edit"
                                        onClick={() => openEditModal(source)}
                                        disabled={saving || deleting}
                                        title="Edit source"
                                    >
                                        <IconPencil />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn icon-btn--danger"
                                        onClick={() => setSourceToDelete(source)}
                                        disabled={saving || deleting}
                                        title="Hapus source"
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
                title={editingId ? 'Edit Sumber Lead' : 'Tambah Sumber Lead'}
            >
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Nama Source</label>
                        <input
                            className="input-field"
                            value={form.value}
                            onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                            placeholder="Contoh: Online, Walk In, Call In, Agent"
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
                            {saving ? 'Menyimpan...' : editingId ? 'Update Source' : 'Tambah Source'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={Boolean(sourceToDelete)}
                onClose={() => setSourceToDelete(null)}
                title="Hapus Sumber Lead"
            >
                <p style={{ margin: 0, color: '#374151', fontSize: '0.9375rem' }}>
                    Hapus source <strong style={{ color: '#1E3A5F' }}>{sourceToDelete?.value}</strong>? Lead lama tetap menyimpan source historisnya.
                </p>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setSourceToDelete(null)} disabled={deleting}>
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
