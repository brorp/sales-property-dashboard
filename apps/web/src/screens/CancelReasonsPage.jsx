'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

const initialForm = {
    code: '',
    label: '',
    sortOrder: '0',
    isActive: true,
};

export default function CancelReasonsPage() {
    const { user } = useAuth();
    const [cancelReasons, setCancelReasons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');

    const loadCancelReasons = useCallback(async () => {
        if (!user) {
            return;
        }

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
            const sortOrderDiff = Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0);
            if (sortOrderDiff !== 0) {
                return sortOrderDiff;
            }

            return String(a?.label || '').localeCompare(String(b?.label || ''));
        });
    }, [cancelReasons]);

    const resetForm = () => {
        setEditingId('');
        setForm(initialForm);
        setError('');
        setFeedback('');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!user) {
            return;
        }

        setSaving(true);
        setError('');
        setFeedback('');

        try {
            const payload = {
                code: form.code,
                label: form.label,
                sortOrder: Number(form.sortOrder || 0),
                isActive: Boolean(form.isActive),
            };

            if (editingId) {
                await apiRequest(`/api/cancel-reasons/${editingId}`, {
                    method: 'PATCH',
                    user,
                    body: payload,
                });
                setFeedback('Cancel reason berhasil diupdate.');
            } else {
                await apiRequest('/api/cancel-reasons', {
                    method: 'POST',
                    user,
                    body: payload,
                });
                setFeedback('Cancel reason berhasil ditambahkan.');
            }

            resetForm();
            await loadCancelReasons();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving cancel reason');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item) => {
        setEditingId(item.id);
        setForm({
            code: item.code || '',
            label: item.label || '',
            sortOrder: String(item.sortOrder ?? 0),
            isActive: Boolean(item.isActive),
        });
        setError('');
        setFeedback('');
    };

    const handleDelete = async (itemId) => {
        if (!user) {
            return;
        }

        const confirmed = window.confirm('Hapus cancel reason ini dari daftar?');
        if (!confirmed) {
            return;
        }

        setSaving(true);
        setError('');
        setFeedback('');
        try {
            await apiRequest(`/api/cancel-reasons/${itemId}`, {
                method: 'DELETE',
                user,
            });
            if (editingId === itemId) {
                resetForm();
            }
            setFeedback('Cancel reason berhasil dihapus.');
            await loadCancelReasons();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting cancel reason');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container">
            <Header title="Kelola Cancel Reason" showBack />

            <div className="card settings-card">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="input-group">
                        <label>Code</label>
                        <input
                            className="input-field"
                            value={form.code}
                            onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                            placeholder="Contoh: harga_tidak_masuk"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Label</label>
                        <input
                            className="input-field"
                            value={form.label}
                            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                            placeholder="Contoh: Harga Tidak Masuk"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Sort Order</label>
                        <input
                            type="number"
                            className="input-field"
                            value={form.sortOrder}
                            onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                        />
                    </div>
                    <label className="export-checklist-item" style={{ alignSelf: 'flex-start' }}>
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                        />
                        <span>Aktif</span>
                    </label>
                    <div className="settings-inline-grid">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingId ? 'Update Cancel Reason' : 'Tambah Cancel Reason'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                            Reset Form
                        </button>
                    </div>
                </form>
                {error ? <p className="settings-error">{error}</p> : null}
                {feedback ? <p className="settings-success">{feedback}</p> : null}
            </div>

            <div className="card settings-card">
                {loading ? <p className="settings-help">Loading cancel reasons...</p> : null}
                {!loading && sortedCancelReasons.length === 0 ? (
                    <p className="settings-help">Belum ada cancel reason untuk client ini.</p>
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
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => handleEdit(item)}
                                        disabled={saving}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn settings-queue-remove"
                                        onClick={() => void handleDelete(item.id)}
                                        disabled={saving}
                                    >
                                        Hapus
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
