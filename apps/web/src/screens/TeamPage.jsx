'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import Header from '../components/Header';

const initialForm = {
    name: '',
    email: '',
    phone: '',
    password: 'sales123',
    queueOrder: '',
    queueLabel: '',
};

export default function TeamPage() {
    const { isAdmin } = useAuth();
    const { teamStats, refreshTeamStats, createSalesUser } = useLeads();
    const [showAddModal, setShowAddModal] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState('');

    useEffect(() => {
        if (!isAdmin) return;
        void refreshTeamStats();
    }, [isAdmin, refreshTeamStats]);

    if (!isAdmin) return null;

    const handleCreateSales = async (e) => {
        e.preventDefault();
        if (!form.name || !form.email || !form.password) return;

        setSubmitLoading(true);
        setSubmitError('');
        setSubmitSuccess('');

        try {
            await createSalesUser({
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                password: form.password,
                phone: form.phone.trim() || null,
                queueOrder: form.queueOrder ? Number(form.queueOrder) : null,
                queueLabel: form.queueLabel.trim() || null,
            });
            setForm(initialForm);
            setShowAddModal(false);
            setSubmitSuccess('Sales user created successfully.');
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed creating sales user');
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="page-container">
            <Header
                title="Kelola Tim Sales"
                rightAction={
                    <button className="btn btn-sm btn-primary" onClick={() => setShowAddModal(true)}>
                        + Sales
                    </button>
                }
            />
            {submitSuccess ? <div className="settings-success">{submitSuccess}</div> : null}
            <div className="team-list">
                {teamStats.map((s) => (
                    <div key={s.id} className="card team-card">
                        <div className="team-header">
                            <div className="team-avatar">{s.name.charAt(0)}</div>
                            <div className="team-info">
                                <h3 className="team-name">{s.name}</h3>
                                <p className="team-email">📧 {s.email}</p>
                            </div>
                        </div>
                        <div className="team-mini-stats">
                            <div className="team-mini-stat"><span className="team-mini-value">{s.total}</span><span className="team-mini-label">Leads</span></div>
                            <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--success)' }}>{s.closed}</span><span className="team-mini-label">Closed</span></div>
                            <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--hot)' }}>{s.hot}</span><span className="team-mini-label">Hot</span></div>
                            <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--warm)' }}>{s.pending}</span><span className="team-mini-label">Pending</span></div>
                        </div>
                        <div className="team-close-rate">
                            <div className="team-close-rate-header"><span className="team-close-rate-label">Close Rate</span><span className="team-close-rate-value">{s.closeRate}%</span></div>
                            <div className="perf-bar-track"><div className="perf-bar-fill" style={{ width: `${s.closeRate}%` }} /></div>
                        </div>
                    </div>
                ))}
            </div>

            {showAddModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>➕ Register Sales Baru</h2>
                        <form onSubmit={handleCreateSales} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Nama</label>
                                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Email</label>
                                <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>No WhatsApp</label>
                                <input className="input-field" placeholder="08xxxx / +62xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Password</label>
                                <input className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Queue Order (optional)</label>
                                <input type="number" min={1} className="input-field" value={form.queueOrder} onChange={(e) => setForm({ ...form, queueOrder: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Queue Label (optional)</label>
                                <input className="input-field" value={form.queueLabel} onChange={(e) => setForm({ ...form, queueLabel: e.target.value })} />
                            </div>
                            {submitError ? <div className="login-error">{submitError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={submitLoading}>
                                {submitLoading ? 'Creating...' : 'Create Sales'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowAddModal(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
