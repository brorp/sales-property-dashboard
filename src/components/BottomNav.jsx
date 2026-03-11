import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './BottomNav.css';

const ROOT_ADMIN_TABS = [
    { key: '/', icon: '🏠', label: 'Home' },
    { key: '/clients', icon: '🏢', label: 'Clients' },
    { key: '/leads', icon: '📋', label: 'Leads' },
    { key: '/profile', icon: '👤', label: 'Profil' },
];

const MANAGER_TABS = [
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
    const { user, isRootAdmin, isManager } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    if (!user || location.pathname === '/login') return null;

    let tabs = SALES_TABS;
    if (isRootAdmin) tabs = ROOT_ADMIN_TABS;
    else if (isManager) tabs = MANAGER_TABS;

    const isActive = (key) => key === '/' ? location.pathname === '/' : location.pathname.startsWith(key);

    return (
        <nav className="bottom-nav">
            <div className="bottom-nav-inner">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`bottom-nav-tab ${isActive(tab.key) ? 'active' : ''}`}
                        onClick={() => navigate(tab.key)}
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
