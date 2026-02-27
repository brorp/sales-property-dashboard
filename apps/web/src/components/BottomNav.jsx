'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

function Icon({ name }) {
    const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'home') {
        return (
            <svg {...common}>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
                <path d="M9 21v-6h6v6" />
            </svg>
        );
    }
    if (name === 'leads') {
        return (
            <svg {...common}>
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
        );
    }
    if (name === 'team') {
        return (
            <svg {...common}>
                <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                <path d="M2 20c0-2.8 2.2-5 5-5h2" />
                <path d="M12 20c0-2.2 1.8-4 4-4h1c2.2 0 4 1.8 4 4" />
            </svg>
        );
    }
    if (name === 'appointment') {
        return (
            <svg {...common}>
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M4 10h16" />
                <path d="M9 14h2M13 14h2" />
            </svg>
        );
    }
    if (name === 'logs') {
        return (
            <svg {...common}>
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h6" />
            </svg>
        );
    }
    if (name === 'settings') {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.8v2.4M12 18.8v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
    );
}

const ADMIN_TABS = [
    { key: '/', icon: 'home', label: 'Home' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Appt' },
    { key: '/activity-logs', icon: 'logs', label: 'Logs' },
    { key: '/team', icon: 'team', label: 'Team' },
    { key: '/settings', icon: 'settings', label: 'Settings' },
];

const SALES_TABS = [
    { key: '/', icon: 'home', label: 'Home' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Appt' },
    { key: '/settings', icon: 'settings', label: 'Settings' },
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
                        <span className="bottom-nav-icon"><Icon name={tab.icon} /></span>
                        <span className="bottom-nav-label">{tab.label}</span>
                        {isActive(tab.key) && <span className="bottom-nav-indicator" />}
                    </button>
                ))}
            </div>
        </nav>
    );
}
