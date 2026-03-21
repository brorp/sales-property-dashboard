'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

const initialForm = {
    value: '',
};

export default function LeadSourcesPage() {
    const { user } = useAuth();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');

    const loadSources = useCallback(async () => {
        if (!user) {
            return;
        }

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
            if (editingId) {
                await apiRequest(`/api/lead-sources/${editingId}`, {
                    method: 'PATCH',
                    user,
                    body: form,
                });
                setFeedback('Source lead berhasil diupdate.');
            } else {
                await apiRequest('/api/lead-sources', {
                    method: 'POST',
                    user,
                    body: form,
                });
                setFeedback('Source lead berhasil ditambahkan.');
            }

            resetForm();
            await loadSources();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving lead source');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (source) => {
        setEditingId(source.id);
        setForm({
            value: source.value || '',
        });
        setError('');
        setFeedback('');
    };

    const handleDelete = async (sourceId) => {
        if (!user) {
            return;
        }

        const confirmed = window.confirm('Hapus source lead ini dari daftar?');
        if (!confirmed) {
            return;
        }

        setSaving(true);
        setError('');
        setFeedback('');
        try {
            await apiRequest(`/api/lead-sources/${sourceId}`, {
                method: 'DELETE',
                user,
            });

            if (editingId === sourceId) {
                resetForm();
            }

            setFeedback('Source lead berhasil dihapus.');
            await loadSources();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting lead source');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container">
            <Header title="Kelola Source Leads" showBack />

            <div className="card settings-card">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="input-group">
                        <label>Nama Source</label>
                        <input
                            className="input-field"
                            value={form.value}
                            onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
                            placeholder="Contoh: Meta Ads, Walk In, Website"
                            required
                        />
                    </div>
                    <div className="settings-inline-grid">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingId ? 'Update Source' : 'Tambah Source'}
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
                {loading ? <p className="settings-help">Loading source leads...</p> : null}
                {!loading && sortedSources.length === 0 ? (
                    <p className="settings-help">Belum ada source lead yang terdaftar untuk client ini.</p>
                ) : null}
                {!loading && sortedSources.length > 0 ? (
                    <div className="settings-queue-list">
                        {sortedSources.map((source) => (
                            <div key={source.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">
                                        {String(source.value || '?').charAt(0).toUpperCase()}
                                    </span>
                                    <div>
                                        <div className="settings-queue-name">{source.value}</div>
                                        <div className="settings-queue-meta">Digunakan untuk form lead manual</div>
                                    </div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => handleEdit(source)}
                                        disabled={saving}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn settings-queue-remove"
                                        onClick={() => void handleDelete(source.id)}
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
