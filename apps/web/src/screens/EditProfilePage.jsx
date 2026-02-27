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
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
    });

    const loadProfile = useCallback(async () => {
        if (!user) {
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await apiRequest('/api/profile/me', { user });
            setForm({
                name: data?.name || user.name || '',
                email: data?.email || user.email || '',
                phone: data?.phone || '',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading profile');
            setForm({
                name: user?.name || '',
                email: user?.email || '',
                phone: '',
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
        if (!user) {
            setError('Unauthorized');
            return;
        }

        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const updated = await apiRequest('/api/profile/me', {
                method: 'PATCH',
                user,
                body: {
                    name: form.name,
                    phone: form.phone || null,
                },
            });
            updateCurrentUser({
                name: updated?.name || form.name,
            });
            setSuccess('Profil berhasil diperbarui.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed updating profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container">
            <Header
                title="Ubah Profil"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadProfile()} disabled={loading || saving}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            <form className="card edit-profile-card" onSubmit={handleSubmit}>
                <div className="input-group">
                    <label>Nama</label>
                    <input
                        type="text"
                        className="input-field"
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
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
                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                        disabled={loading || saving}
                        placeholder="+6281234567890"
                    />
                </div>

                {error ? <div className="settings-error">{error}</div> : null}
                {success ? <div className="settings-success">{success}</div> : null}

                <button className="btn btn-primary btn-full" type="submit" disabled={loading || saving}>
                    {saving ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
            </form>
        </div>
    );
}
