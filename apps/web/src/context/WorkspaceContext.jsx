'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AUTH_STORAGE_KEY, WORKSPACE_STORAGE_KEY } from '../lib/api';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeWorkspace, setActiveWorkspace] = useState(null);

    const loadWorkspaces = useCallback(async () => {
        try {
            setLoading(true);

            // This MUST point at the backend server, not the Vercel frontend.
            // We read the same env var the rest of the app uses, but we strip
            // any workspace apiPrefix so we always hit the root backend URL.
            let apiBaseUrl = '';

            const explicitBase = process.env.NEXT_PUBLIC_API_BASE_URL;
            if (explicitBase && String(explicitBase).trim()) {
                apiBaseUrl = String(explicitBase).trim().replace(/\/$/, '');
                // Upgrade http → https when page is served over https
                if (
                    typeof window !== 'undefined' &&
                    window.location.protocol === 'https:' &&
                    apiBaseUrl.startsWith('http://') &&
                    !apiBaseUrl.startsWith('http://localhost') &&
                    !apiBaseUrl.startsWith('http://127.0.0.1')
                ) {
                    apiBaseUrl = apiBaseUrl.replace(/^http:\/\//i, 'https://');
                }
            }
            // localhost dev: use relative URL → Next.js rewrites forwards to port 3001
            // (no explicit baseUrl needed)

            const response = await fetch(`${apiBaseUrl}/api/public/workspaces`);
            if (response.ok) {
                const data = await response.json();
                setWorkspaces(data);

                // Restore previously selected workspace from localStorage
                const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
                let current = null;
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        current = data.find((w) => w.slug === parsed.slug) || null;
                    } catch (err) {}
                }

                // Default to first workspace when nothing is stored / saved is stale
                if (!current && data.length > 0) {
                    current = data[0];
                    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(current));
                }

                setActiveWorkspace(current);
            } else {
                console.error('Failed to load workspaces, status:', response.status);
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
            let nextPath = '/';

            try {
                const rawUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
                if (rawUser) {
                    const parsedUser = JSON.parse(rawUser);
                    if (parsedUser?.role === 'sales') {
                        nextPath = '/daily-tasks';
                    } else if (parsedUser?.role === 'supervisor') {
                        nextPath = '/supervisor-tasks';
                    }
                }
            } catch {
                // ignore malformed local auth state
            }

            // Force reload so that all contexts/API clients remount and use the new apiPrefix
            window.location.href = nextPath;
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
