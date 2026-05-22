'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export default function EditProfilePage() {
    const { user, updateCurrentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [form, setForm] = useState({ name: '', email: '', phone: '' });
    const phoneReadOnly = user?.role === 'sales';


    const loadProfile = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError('');
        try {
            const data = await apiRequest('/api/profile/me', { user });
            setForm({
                name: data?.name || user.name || '',
                email: data?.email || user.email || '',
                phone: data?.phone || user?.phone || '',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading profile');
            setForm({
                name: user?.name || '',
                email: user?.email || '',
                phone: user?.phone || '',
            });
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!user) { setError('Unauthorized'); return; }
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const updated = await apiRequest('/api/profile/me', {
                method: 'PATCH',
                user,
                body: {
                    name: form.name,
                    ...(phoneReadOnly ? {} : { phone: form.phone || null }),
                },
            });
            updateCurrentUser({
                name: updated?.name || form.name,
                phone: updated?.phone || form.phone || null,
            });
            setForm((prev) => ({
                ...prev,
                name: updated?.name || prev.name,
                email: updated?.email || prev.email,
                phone: updated?.phone || prev.phone,
            }));
            setSuccess('Profil berhasil diperbarui.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed updating profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container ep-page">
            <Header title="Ubah Profil" showBack />

            <form className="ep-card" onSubmit={handleSubmit}>
                <div className="input-group">
                    <label>Nama</label>
                    <input
                        type="text"
                        className="input-field"
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        disabled={loading || saving}
                        required
                    />
                </div>

                <div className="input-group">
                    <label>Email</label>
                    <input
                        type="email"
                        className="input-field"
                        value={form.email}
                        disabled
                    />
                </div>

                <div className="input-group">
                    <label>No. WhatsApp</label>
                    <input
                        type="tel"
                        className="input-field"
                        value={form.phone}
                        onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                        disabled={loading || saving || phoneReadOnly}
                        placeholder="+6281234567890"
                    />
                    {phoneReadOnly ? (
                        <p className="ep-help">
                            Nomor WhatsApp dikelola oleh admin dan akan otomatis mengikuti perubahan terbaru.
                        </p>
                    ) : null}
                </div>

                {error ? <p className="ep-error">{error}</p> : null}
                {success ? <p className="ep-success">{success}</p> : null}

                <button className="btn btn-primary btn-full" type="submit" disabled={loading || saving}>
                    {saving ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
            </form>
        </div>
    );
}
