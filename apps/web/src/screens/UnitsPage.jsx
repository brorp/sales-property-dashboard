'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

const initialForm = {
    unitName: '',
};

export default function UnitsPage() {
    const { user } = useAuth();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState('');

    const loadUnits = useCallback(async () => {
        if (!user) {
            return;
        }
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
        return [...units].sort((a, b) =>
            String(a?.unitName || '').localeCompare(String(b?.unitName || ''))
        );
    }, [units]);

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
                await apiRequest(`/api/units/${editingId}`, {
                    method: 'PATCH',
                    user,
                    body: form,
                });
                setFeedback('Unit berhasil diupdate.');
            } else {
                await apiRequest('/api/units', {
                    method: 'POST',
                    user,
                    body: form,
                });
                setFeedback('Unit berhasil ditambahkan.');
            }
            resetForm();
            await loadUnits();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed saving unit');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (unit) => {
        setEditingId(unit.id);
        setForm({
            unitName: unit.unitName || '',
        });
        setError('');
        setFeedback('');
    };

    const handleDelete = async (unitId) => {
        if (!user) {
            return;
        }

        const confirmed = window.confirm('Hapus unit ini dari daftar?');
        if (!confirmed) {
            return;
        }

        setSaving(true);
        setError('');
        setFeedback('');
        try {
            await apiRequest(`/api/units/${unitId}`, {
                method: 'DELETE',
                user,
            });
            if (editingId === unitId) {
                resetForm();
            }
            setFeedback('Unit berhasil dihapus.');
            await loadUnits();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed deleting unit');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container">
            <Header title="Kelola Unit" showBack />

            <div className="card settings-card">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="input-group">
                        <label>Tipe Unit</label>
                        <input
                            className="input-field"
                            value={form.unitName}
                            onChange={(event) => setForm((prev) => ({ ...prev, unitName: event.target.value }))}
                            placeholder="Contoh: Aster, Type 72, Loft Corner"
                            required
                        />
                    </div>
                    <div className="settings-inline-grid">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Menyimpan...' : editingId ? 'Update Unit' : 'Tambah Unit'}
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
                {loading ? <p className="settings-help">Loading unit...</p> : null}
                {!loading && sortedUnits.length === 0 ? (
                    <p className="settings-help">Belum ada unit yang terdaftar untuk client ini.</p>
                ) : null}
                {!loading && sortedUnits.length > 0 ? (
                    <div className="settings-queue-list">
                        {sortedUnits.map((unit) => (
                            <div key={unit.id} className="settings-queue-item">
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">{String(unit.unitName || '?').charAt(0).toUpperCase()}</span>
                                    <div>
                                        <div className="settings-queue-name">{unit.unitName}</div>
                                    </div>
                                </div>
                                <div className="settings-queue-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn"
                                        onClick={() => handleEdit(unit)}
                                        disabled={saving}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary settings-queue-btn settings-queue-remove"
                                        onClick={() => void handleDelete(unit.id)}
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
