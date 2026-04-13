'use client';

import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import './WorkspaceSwitcher.css';

export default function WorkspaceSwitcher() {
    const { workspaces, activeWorkspace, switchWorkspace, loading } = useWorkspace();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (loading || workspaces.length <= 1) {
        return null; // Don't show if loading or only 1 workspace exists
    }

    const handleSelect = (slug) => {
        setIsOpen(false);
        if (activeWorkspace?.slug !== slug) {
            switchWorkspace(slug);
        }
    };

    return (
        <div className="workspace-switcher" ref={dropdownRef}>
            <button 
                type="button" 
                className="workspace-switcher-btn"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="workspace-switcher-info">
                    <span className="workspace-switcher-label">{activeWorkspace?.name || 'Pilih Workspace'}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`workspace-switcher-chevron ${isOpen ? 'open' : ''}`}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            {isOpen && (
                <div className="workspace-switcher-dropdown">
                    <div className="workspace-switcher-header">Pilih Workspace</div>
                    <div className="workspace-switcher-list">
                        {workspaces.map((ws) => (
                            <button
                                key={ws.slug}
                                type="button"
                                className={`workspace-switcher-item ${activeWorkspace?.slug === ws.slug ? 'active' : ''}`}
                                onClick={() => handleSelect(ws.slug)}
                            >
                                <span className="workspace-switcher-item-label">{ws.name}</span>
                                {activeWorkspace?.slug === ws.slug && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="workspace-switcher-check">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
