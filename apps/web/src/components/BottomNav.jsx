'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const ADMIN_TABS = [
    { key: '/', icon: '🏠', label: 'Home' },
    { key: '/leads', icon: '📋', label: 'Leads' },
    { key: '/team', icon: '👥', label: 'Team' },
    { key: '/profile', icon: '👤', label: 'Profil' },
];

const SALES_TABS = [
    { key: '/', icon: '🏠', label: 'Home' },
    { key: '/leads', icon: '📋', label: 'Leads' },
    { key: '/profile', icon: '👤', label: 'Profil' },
];

export default function BottomNav() {
    const { user, isAdmin } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    if (!user || pathname === '/login') return null;

    const tabs = isAdmin ? ADMIN_TABS : SALES_TABS;
    const isActive = (key) => key === '/' ? pathname === '/' : pathname.startsWith(key);

    return (
        <nav className="bottom-nav">
            <div className="bottom-nav-inner">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`bottom-nav-tab ${isActive(tab.key) ? 'active' : ''}`}
                        onClick={() => router.push(tab.key)}
                    >
                        <span className="bottom-nav-icon">{tab.icon}</span>
                        <span className="bottom-nav-label">{tab.label}</span>
                        {isActive(tab.key) && <span className="bottom-nav-indicator" />}
                    </button>
                ))}
            </div>
        </nav>
    );
}
