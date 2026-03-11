import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import './ClientsPage.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function ClientsPage() {
    const { user } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', slug: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/clients`, {
                credentials: 'include',
                headers: { 'x-dev-user-email': user?.email || '' },
            });
            if (res.ok) {
                setClients(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch clients', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { fetchClients(); }, [fetchClients]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');
        if (!formData.name || !formData.slug) {
            setError('Name dan slug wajib diisi');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/clients`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'x-dev-user-email': user?.email || '',
                },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || 'Gagal membuat client');
                return;
            }

            setFormData({ name: '', slug: '' });
            setShowModal(false);
            fetchClients();
        } catch {
            setError('Gagal terhubung ke server');
        } finally {
            setSaving(false);
        }
    };

    const generateSlug = (name) => {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    };

    return (
        <div className="clients-page">
            <div className="clients-header">
                <h1>🏢 Manajemen Client</h1>
                <button className="btn-primary" onClick={() => setShowModal(true)}>
                    + Tambah Client
                </button>
            </div>

            {loading ? (
                <div className="loading-state">Memuat data client...</div>
            ) : clients.length === 0 ? (
                <div className="empty-state">
                    <p>Belum ada client terdaftar.</p>
                </div>
            ) : (
                <div className="clients-grid">
                    {clients.map(client => (
                        <div key={client.id} className={`client-card ${!client.isActive ? 'inactive' : ''}`}>
                            <div className="client-card-header">
                                <h3>{client.name}</h3>
                                <span className={`status-badge ${client.isActive ? 'active' : 'inactive'}`}>
                                    {client.isActive ? 'Aktif' : 'Nonaktif'}
                                </span>
                            </div>
                            <div className="client-card-body">
                                <p className="client-slug">/{client.slug}</p>
                                <p className="client-date">
                                    Dibuat: {new Date(client.createdAt).toLocaleDateString('id-ID')}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Tambah Client Baru</h2>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label>Nama Client</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => {
                                        const name = e.target.value;
                                        setFormData({ name, slug: generateSlug(name) });
                                    }}
                                    placeholder="PT Maju Properti"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Slug (URL)</label>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                                    placeholder="maju-properti"
                                    required
                                />
                            </div>
                            {error && <p className="form-error">{error}</p>}
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="btn-primary" disabled={saving}>
                                    {saving ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
