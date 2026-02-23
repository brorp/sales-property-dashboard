'use client';

import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { USERS } from '../data/mockData';
import Header from '../components/Header';

export default function TeamPage() {
    const { isAdmin } = useAuth();
    const { leads } = useLeads();

    if (!isAdmin) return null;
    const salesUsers = USERS.filter(u => u.role === 'sales');

    return (
        <div className="page-container">
            <Header title="Kelola Tim Sales" />
            <div className="team-list">
                {salesUsers.map(s => {
                    const sLeads = leads.filter(l => l.assignedTo === s.id);
                    const closed = sLeads.filter(l => l.progress === 'closed').length;
                    const hot = sLeads.filter(l => l.clientStatus === 'hot').length;
                    const pending = sLeads.filter(l => l.progress === 'pending' || l.progress === 'new').length;
                    const rate = sLeads.length > 0 ? Math.round((closed / sLeads.length) * 100) : 0;

                    return (
                        <div key={s.id} className="card team-card">
                            <div className="team-header">
                                <div className="team-avatar">{s.name.charAt(0)}</div>
                                <div className="team-info">
                                    <h3 className="team-name">{s.name}</h3>
                                    <p className="team-email">📧 {s.email}</p>
                                </div>
                            </div>
                            <div className="team-mini-stats">
                                <div className="team-mini-stat"><span className="team-mini-value">{sLeads.length}</span><span className="team-mini-label">Leads</span></div>
                                <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--success)' }}>{closed}</span><span className="team-mini-label">Closed</span></div>
                                <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--hot)' }}>{hot}</span><span className="team-mini-label">Hot</span></div>
                                <div className="team-mini-stat"><span className="team-mini-value" style={{ color: 'var(--warm)' }}>{pending}</span><span className="team-mini-label">Pending</span></div>
                            </div>
                            <div className="team-close-rate">
                                <div className="team-close-rate-header"><span className="team-close-rate-label">Close Rate</span><span className="team-close-rate-value">{rate}%</span></div>
                                <div className="perf-bar-track"><div className="perf-bar-fill" style={{ width: `${rate}%` }} /></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
