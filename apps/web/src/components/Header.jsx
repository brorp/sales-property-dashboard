'use client';

import { useRouter } from 'next/navigation';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';

export default function Header({ title, showBack = false, rightAction = null }) {
    const router = useRouter();
    const tenantContext = useTenant();
    const { user } = useAuth();

    // Fallback if tenant context isn't fully loaded but we have the slug
    const formatClientNameFromSlug = (slug) => {
        if (!slug) return '';
        return slug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const clientName = tenantContext?.tenant?.name || formatClientNameFromSlug(user?.clientSlug);
    const dynamicTitle = clientName ? `${clientName} - ${title}` : title;

    return (
        <header className="app-header">
            <div className="app-header-left">
                {showBack && <button className="back-btn" onClick={() => router.back()}>←</button>}
                <h1 className="app-header-title">{dynamicTitle}</h1>
            </div>
            {rightAction && <div className="app-header-right">{rightAction}</div>}
        </header>
    );
}
