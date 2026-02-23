'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getSalesName, getTimeAgo } from '../data/mockData';

export default function DashboardPage() {
    const { user, isAdmin } = useAuth();
    const { getStats, getLeadsForUser, getSalesUsers } = useLeads();
    const router = useRouter();

    const stats = getStats(user.id, user.role);
    const myLeads = getLeadsForUser(user.id, user.role);
    const recentLeads = [...myLeads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const salesUsers = getSalesUsers();

    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 17 ? 'Selamat Siang' : 'Selamat Malam';
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const todayStr = now.toISOString().split('T')[0];
    const todayAppointments = myLeads
        .filter(l => l.appointments?.some(a => a.date === todayStr))
        .map(l => ({ lead: l, appointment: l.appointments.find(a => a.date === todayStr) }));

    const needsFollowUp = myLeads.filter(l => {
        if (l.progress === 'closed' || l.progress === 'rejected') return false;
        if (l.progress === 'new') return true;
        const lastActivity = l.activities?.[0];
        if (!lastActivity) return true;
        return (now - new Date(lastActivity.timestamp)) / 86400000 > 1;
    }).slice(0, 5);

    const salesPerf = isAdmin ? salesUsers.map(s => {
        const sLeads = myLeads.filter(l => l.assignedTo === s.id);
        return { ...s, total: sLeads.length, closed: sLeads.filter(l => l.progress === 'closed').length };
    }).sort((a, b) => b.closed - a.closed) : [];

    const statusIcon = { hot: '🔥', warm: '🌡️', cold: '🧊', lost: '❌', deal: '✅' };
    const statusClass = { hot: 'badge-hot', warm: 'badge-warm', cold: 'badge-cold', lost: 'badge-danger', deal: 'badge-success' };
    const progressLabel = { new: '📥 Baru', 'follow-up': '📞 Follow-up', pending: '⏳ Pending', appointment: '📅 Appointment', rejected: '❌ Rejected', closed: '✅ Closed' };

    return (
        <div className="page-container">
            <div className="page-greeting">
                <h1>{greeting}, {user.name.split(' ')[0]} 👋</h1>
                <p>{dateStr}</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <span className="stat-label">{isAdmin ? 'Total Leads' : 'My Leads'}</span>
                    <span className="stat-value">{stats.total}</span>
                </div>
                <div className="stat-card stat-hot">
                    <span className="stat-label">Hot Client</span>
                    <span className="stat-value" style={{ color: 'var(--hot)' }}>{stats.hot}</span>
                </div>
                <div className="stat-card stat-closed">
                    <span className="stat-label">Closed Deal</span>
                    <span className="stat-value" style={{ color: 'var(--success)' }}>{stats.closed}</span>
                </div>
                <div className="stat-card stat-pending">
                    <span className="stat-label">Perlu Tindakan</span>
                    <span className="stat-value" style={{ color: 'var(--warm)' }}>{stats.pending + stats.new}</span>
                </div>
            </div>

            {todayAppointments.length > 0 && (
                <section className="dash-section">
                    <h2 className="section-title">📅 Appointment Hari Ini</h2>
                    <div className="card-list">
                        {todayAppointments.map(({ lead, appointment }) => (
                            <div key={lead.id} className="card card-clickable appt-card" onClick={() => router.push(`/leads/${lead.id}`)}>
                                <div className="appt-time">🕐 {appointment.time}</div>
                                <div className="appt-name">{lead.name}</div>
                                <div className="appt-location">📍 {appointment.location}</div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {isAdmin && salesPerf.length > 0 && (
                <section className="dash-section">
                    <h2 className="section-title">📊 Performa Sales</h2>
                    <div className="card">
                        {salesPerf.map(s => (
                            <div key={s.id} className="perf-bar-container">
                                <span className="perf-bar-name">{s.name.split(' ')[0]}</span>
                                <div className="perf-bar-track">
                                    <div className="perf-bar-fill" style={{ width: `${s.total > 0 ? (s.closed / s.total) * 100 : 0}%` }} />
                                </div>
                                <span className="perf-bar-value">{s.closed}/{s.total}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {needsFollowUp.length > 0 && (
                <section className="dash-section">
                    <h2 className="section-title">⚡ Perlu Follow-up</h2>
                    <div className="card-list">
                        {needsFollowUp.map(lead => (
                            <div key={lead.id} className="card card-clickable lead-row" onClick={() => router.push(`/leads/${lead.id}`)}>
                                <div className="lead-row-top">
                                    <span className="lead-row-name">
                                        <span className={`badge ${statusClass[lead.clientStatus]}`}>{statusIcon[lead.clientStatus]} {lead.clientStatus}</span>
                                        {lead.name}
                                    </span>
                                    <span className="lead-row-ago">{getTimeAgo(lead.activities?.[0]?.timestamp || lead.createdAt)}</span>
                                </div>
                                <div className="lead-row-meta">
                                    <span>{progressLabel[lead.progress]}</span>
                                    {isAdmin && <span>→ {getSalesName(lead.assignedTo).split(' ')[0]}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="dash-section">
                <h2 className="section-title">🕐 Leads Terbaru</h2>
                <div className="card-list">
                    {recentLeads.map(lead => (
                        <div key={lead.id} className="card card-clickable lead-row" onClick={() => router.push(`/leads/${lead.id}`)}>
                            <div className="lead-row-top">
                                <span className="lead-row-name">
                                    <span className={`badge ${statusClass[lead.clientStatus]}`}>{statusIcon[lead.clientStatus]} {lead.clientStatus}</span>
                                    {lead.name}
                                </span>
                                <span className="lead-row-ago">{getTimeAgo(lead.createdAt)}</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📱 {lead.phone}</span>
                                {isAdmin && <span>→ {getSalesName(lead.assignedTo).split(' ')[0]}</span>}
                            </div>
                        </div>
                    ))}
                </div>
                <button className="btn btn-secondary btn-full see-all-btn" onClick={() => router.push('/leads')}>
                    Lihat Semua Leads →
                </button>
            </section>
        </div>
    );
}
