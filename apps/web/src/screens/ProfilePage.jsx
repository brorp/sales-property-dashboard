'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import Header from '../components/Header';

export default function ProfilePage() {
    const { user, logout, isAdmin, getRoleLabel } = useAuth();
    const tenant = useTenant();
    const router = useRouter();

    const handleLogout = () => { logout(); router.replace('/login'); };
    const goToDistributionOrder = () => { router.push('/settings/distribution-order'); };
    const goToUnits = () => { router.push('/settings/units'); };
    const goToWhatsAppSettings = () => { router.push('/settings/whatsapp'); };
    const goToBroadcast = () => { router.push('/broadcast'); };
    const goToEditProfile = () => { router.push('/settings/profile'); };
    const canManageDistribution = user?.role === 'client_admin';
    const canManageSharedWhatsApp = tenant.canManageSharedWhatsApp(user);

    return (
        <div className="page-container">
            <Header title="Settings" />
            <div className="profile-card">
                <div className="profile-avatar">{user.name.charAt(0)}</div>
                <h2 className="profile-name">{user.name}</h2>
                <p className="profile-email">{user.email}</p>
                <p className="profile-email">{tenant.isClientSite ? tenant.siteLabel : 'Master Workspace'}</p>
                <span className={`badge ${isAdmin ? 'badge-purple' : 'badge-success'}`}>
                    {isAdmin ? `👑 ${getRoleLabel(user.role)}` : '💼 Sales'}
                </span>
            </div>
            <div className="profile-menu-list">
                <button className="profile-menu-item" onClick={goToEditProfile}>
                    <span>👤</span><span>Ubah Profil</span><span className="profile-menu-arrow">→</span>
                </button>
                {canManageDistribution ? (
                    <button className="profile-menu-item" onClick={goToDistributionOrder}>
                        <span>🔁</span><span>Distribution Order</span><span className="profile-menu-arrow">→</span>
                    </button>
                ) : null}
                {canManageDistribution ? (
                    <button className="profile-menu-item" onClick={goToUnits}>
                        <span>🏢</span><span>Kelola Unit</span><span className="profile-menu-arrow">→</span>
                    </button>
                ) : null}
                {canManageSharedWhatsApp ? (
                    <button className="profile-menu-item" onClick={goToWhatsAppSettings}>
                        <span>📱</span><span>WhatsApp Settings</span><span className="profile-menu-arrow">→</span>
                    </button>
                ) : null}
                {canManageSharedWhatsApp ? (
                    <button className="profile-menu-item" onClick={goToBroadcast}>
                        <span>📣</span><span>WhatsApp Broadcast</span><span className="profile-menu-arrow">→</span>
                    </button>
                ) : null}
                <button className="profile-menu-item profile-logout" onClick={handleLogout}><span>🚪</span><span>Keluar</span><span className="profile-menu-arrow">→</span></button>
            </div>
            <p className="profile-version">Property Lounge Dashboard v1.0</p>
        </div>
    );
}
