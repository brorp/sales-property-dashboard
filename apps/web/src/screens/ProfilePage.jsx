'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import Header from '../components/Header';

export default function ProfilePage() {
    const { user, logout, isAdmin } = useAuth();
    const { getStats, refreshAll } = useLeads();
    const router = useRouter();
    const stats = getStats(user.id, user.role);

    const handleLogout = () => { logout(); router.replace('/login'); };
    const handleRefresh = async () => { await refreshAll(); };
    const goToSettings = () => { router.push('/settings'); };

    return (
        <div className="page-container">
            <Header title="Profil" />
            <div className="profile-card">
                <div className="profile-avatar">{user.name.charAt(0)}</div>
                <h2 className="profile-name">{user.name}</h2>
                <p className="profile-email">{user.email}</p>
                <span className={`badge ${isAdmin ? 'badge-purple' : 'badge-success'}`}>{isAdmin ? '👑 Admin' : '💼 Sales'}</span>
            </div>
            <div className="profile-stats-row">
                <div className="profile-stat-item"><span className="profile-stat-num">{stats.total}</span><span className="profile-stat-label">Leads</span></div>
                <div className="profile-stat-item"><span className="profile-stat-num" style={{ color: 'var(--success)' }}>{stats.closed}</span><span className="profile-stat-label">Closed</span></div>
                <div className="profile-stat-item"><span className="profile-stat-num" style={{ color: 'var(--hot)' }}>{stats.hot}</span><span className="profile-stat-label">Hot</span></div>
            </div>
            <div className="profile-menu-list">
                <button className="profile-menu-item"><span>📅</span><span>Sambungkan Google Calendar</span><span className="profile-menu-arrow">→</span></button>
                <button className="profile-menu-item"><span>🔔</span><span>Pengaturan Notifikasi</span><span className="profile-menu-arrow">→</span></button>
                {isAdmin ? (
                    <button className="profile-menu-item" onClick={goToSettings}>
                        <span>📱</span><span>WhatsApp Settings</span><span className="profile-menu-arrow">→</span>
                    </button>
                ) : null}
                <button className="profile-menu-item" onClick={handleRefresh}><span>🔄</span><span>Refresh Data API</span><span className="profile-menu-arrow">→</span></button>
                <button className="profile-menu-item profile-logout" onClick={handleLogout}><span>🚪</span><span>Keluar</span><span className="profile-menu-arrow">→</span></button>
            </div>
            <p className="profile-version">Property Lounge Dashboard v1.0</p>
        </div>
    );
}
