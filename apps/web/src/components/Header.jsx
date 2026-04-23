'use client';

import { useRouter } from 'next/navigation';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function Header({ title, showBack = false, rightAction = null }) {
    const router = useRouter();

    return (
        <>
            <header className="app-header">
                <div className="app-header-left">
                    {showBack && <button className="back-btn" onClick={() => router.back()}>←</button>}
                    <h1 className="app-header-title">{title}</h1>
                </div>
                {rightAction && <div className="app-header-right">{rightAction}</div>}
            </header>
            <WorkspaceSwitcher variant="mobile" />
        </>
    );
}
