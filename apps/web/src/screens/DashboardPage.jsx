'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getRejectedReasonLabel, getTimeAgo } from '../constants/crm';
import { apiRequest } from '../lib/api';

export default function DashboardPage() {
    const { user, isAdmin } = useAuth();
    const { getStats, getLeadsForUser, getSalesUsers, getLayer2Charts, refreshAll } = useLeads();
    const router = useRouter();
    const [stopLoading, setStopLoading] = useState(false);
    const [stopMessage, setStopMessage] = useState('');

    const stats = getStats(user.id, user.role);
    const myLeads = getLeadsForUser(user.id, user.role);
    const charts = getLayer2Charts(user.id, user.role);
    const recentLeads = [...myLeads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const salesUsers = getSalesUsers();
    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';

    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 17 ? 'Selamat Siang' : 'Selamat Malam';
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const todayStr = now.toISOString().split('T')[0];
    const todayAppointments = myLeads
        .filter(l => l.appointments?.some(a => a.date === todayStr))
        .map(l => ({ lead: l, appointment: l.appointments.find(a => a.date === todayStr) }));

    const needsFollowUp = myLeads.filter(l => {
        if (l.progress === 'closed' || l.progress === 'rejected' || l.layer2Status === 'rejected') return false;
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
    const progressLabel = { pending: '⏳ Pending', prospecting: '🔎 Prospecting', 'follow-up': '📞 Follow-up', appointment: '📅 Appointment', rejected: '❌ Rejected', closed: '✅ Closed', 'no-action': '🗑️ No Action', new: '📥 New' };
    const layer2Label = { prospecting: 'Prospecting', sudah_survey: 'Sudah Survey', mau_survey: 'Mau Survey', closing: 'Closing', rejected: 'Rejected' };

    const handleEmergencyStop = async () => {
        if (!window.confirm('Stop semua distribusi aktif sekarang?')) return;
        setStopLoading(true);
        setStopMessage('');
        try {
            const result = await apiRequest('/api/distribution/stop-all', {
                method: 'POST',
                user,
            });
            await refreshAll();
            setStopMessage(`Emergency stop success. Stopped ${result?.stoppedCycles || 0} active cycle(s).`);
        } catch (err) {
            setStopMessage(err instanceof Error ? err.message : 'Failed stopping distributions');
        } finally {
            setStopLoading(false);
        }
    };

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
                    <span className="stat-value" style={{ color: 'var(--warm)' }}>{stats.pending + (stats.prospecting || 0) + (stats.new || 0)}</span>
                </div>
            </div>

            {isAdmin && (
                <section className="dash-section">
                    <div className="card">
                        <h2 className="section-title">Emergency</h2>
                        <button className="btn btn-danger btn-full" disabled={stopLoading} onClick={handleEmergencyStop}>
                            {stopLoading ? 'Stopping...' : 'Stop All Active Distribution'}
                        </button>
                        {stopMessage ? <p className="settings-help">{stopMessage}</p> : null}
                    </div>
                </section>
            )}

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

            {isAdmin && (
                <section className="dash-section">
                    <h2 className="section-title">📈 Layer 2 Status (%)</h2>
                    <div className="card chart-card">
                        {charts.layer2StatusChart.items.map(item => (
                            <div key={item.key} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{layer2Label[item.key] || item.key}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className={`chart-fill chart-fill-${item.key}`}
                                        style={{ width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {isAdmin && (
                <section className="dash-section">
                    <h2 className="section-title">🧪 Alasan Rejected (%)</h2>
                    <div className="card chart-card">
                        {charts.rejectedReasonChart.total === 0 ? (
                            <div className="empty-desc">Belum ada data rejected.</div>
                        ) : charts.rejectedReasonChart.items.map(item => (
                            <div key={item.key} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{getRejectedReasonLabel(item.key)}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className="chart-fill chart-fill-reason"
                                        style={{ width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%` }}
                                    />
                                </div>
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
                                    <span>Layer2: {layer2Label[lead.layer2Status] || '-'}</span>
                                    {isAdmin && <span>→ {getSalesNameById(lead.assignedTo).split(' ')[0]}</span>}
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
                                <span>Layer2: {layer2Label[lead.layer2Status] || '-'}</span>
                                {isAdmin && <span>→ {getSalesNameById(lead.assignedTo).split(' ')[0]}</span>}
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
