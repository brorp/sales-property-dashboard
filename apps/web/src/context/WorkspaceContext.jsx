'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WORKSPACE_STORAGE_KEY } from '../lib/api';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeWorkspace, setActiveWorkspace] = useState(null);

    const loadWorkspaces = useCallback(async () => {
        try {
            setLoading(true);
            
            // We use standard fetch here to avoid circular dependency and force hitting the base origin
            const baseUrlInfo = new URL(window.location.href);
            // In development, Next.js runs on port 3000, and standard proxy applies.
            // When proxying to PM2, Nginx handles it.
            // Instead of parsing `getApiBaseUrl` (which might append the prefix), we want the root domain.
            
            // Safe fallback to using relative path (Next.js proxy / API direct)
            const protocol = window.location.protocol;
            const host = window.location.host;
            let baseUrl = `${protocol}//${host}`;
            
            // Special case for local dev: Use the Next.js local proxy
            if (host.includes('localhost') || host.includes('127.0.0.1')) {
                baseUrl = ''; // relative url handled by Next.js rewrites
            }

            const response = await fetch(`${baseUrl}/api/public/workspaces`);
            if (response.ok) {
                const data = await response.json();
                setWorkspaces(data);

                // Attempt to load from localStorage
                const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
                let current = null;
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        current = data.find((w) => w.slug === parsed.slug);
                    } catch (err) {}
                }

                // If not found in localStorage or no longer valid, default to the first one
                if (!current && data.length > 0) {
                    current = data[0];
                    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(current));
                }

                setActiveWorkspace(current);
            }
        } catch (error) {
            console.error('Failed to load workspaces:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadWorkspaces();
    }, [loadWorkspaces]);

    const switchWorkspace = (slug) => {
        const target = workspaces.find((w) => w.slug === slug);
        if (target) {
            window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(target));
            setActiveWorkspace(target);
            // Force reload so that all contexts/API clients remount and use the new apiPrefix
            window.location.href = '/';
        }
    };

    return (
        <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, switchWorkspace, loading }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) {
        throw new Error('useWorkspace must be used within WorkspaceProvider');
    }
    return ctx;
}
