'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { publicApiRequest } from '../lib/api';

const TenantContext = createContext(null);

function getCurrentHost() {
    if (typeof window === 'undefined') {
        return '';
    }

    return String(window.location.host || '').trim().toLowerCase();
}

function createFallbackContext(host) {
    return {
        loading: false,
        siteType: 'master',
        host: host || null,
        siteLabel: 'Property Lounge Master',
        siteDescription: 'Master dashboard for all property developer clients.',
        tenant: null,
        whatsapp: {
            provider: 'dummy',
            mode: 'dummy',
            activeClientSlug: null,
            activeClientId: null,
            activeClientName: null,
        },
    };
}

export function TenantProvider({ children }) {
    const [context, setContext] = useState({
        loading: true,
        siteType: 'master',
        host: null,
        siteLabel: 'Property Lounge Master',
        siteDescription: 'Master dashboard for all property developer clients.',
        tenant: null,
        whatsapp: {
            provider: 'dummy',
            mode: 'dummy',
            activeClientSlug: null,
            activeClientId: null,
            activeClientName: null,
        },
    });

    useEffect(() => {
        let cancelled = false;

        const loadTenantContext = async () => {
            const host = getCurrentHost();

            try {
                const data = await publicApiRequest(`/api/public/app-context?host=${encodeURIComponent(host)}`);
                if (!cancelled) {
                    setContext({
                        loading: false,
                        siteType: data?.siteType || 'master',
                        host: data?.host || host || null,
                        siteLabel: data?.siteLabel || 'Property Lounge Master',
                        siteDescription: data?.siteDescription || 'Master dashboard for all property developer clients.',
                        tenant: data?.tenant || null,
                        whatsapp: data?.whatsapp || {
                            provider: 'dummy',
                            mode: 'dummy',
                            activeClientSlug: null,
                            activeClientId: null,
                            activeClientName: null,
                        },
                    });
                }
            } catch {
                if (!cancelled) {
                    setContext(createFallbackContext(host));
                }
            }
        };

        void loadTenantContext();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined' || context.loading) {
            return;
        }

        const titleBase = context.siteType === 'client'
            ? `${context.siteLabel} | Property Lounge`
            : 'Property Lounge Master';

        document.title = titleBase;
    }, [context.loading, context.siteLabel, context.siteType]);

    const value = useMemo(() => {
        const isMasterSite = context.siteType === 'master';
        const isClientSite = context.siteType === 'client';
        const currentTenantSlug = context.tenant?.slug || null;
        const isLocalHost =
            context.host?.startsWith('localhost') ||
            context.host?.startsWith('127.0.0.1');

        function isUserAllowedOnCurrentSite(userLike) {
            if (!userLike) {
                return false;
            }
            
            // Opsi A: Semua user (termasuk sales) valid di semua workspace.
            return true;
        }

        function canManageSharedWhatsApp(userLike) {
            if (!userLike) {
                return false;
            }

            if (userLike.role === 'root_admin') {
                return isMasterSite;
            }

            if (userLike.role !== 'client_admin') {
                return false;
            }

            if (context.whatsapp?.mode !== 'shared_single_client') {
                return isMasterSite || isClientSite;
            }

            if (!context.whatsapp?.activeClientSlug) {
                return isMasterSite || isClientSite;
            }

            if (isMasterSite) {
                return Boolean(
                    userLike.clientSlug &&
                    context.whatsapp?.activeClientSlug &&
                    userLike.clientSlug === context.whatsapp.activeClientSlug
                );
            }

            return Boolean(
                currentTenantSlug &&
                context.whatsapp?.activeClientSlug &&
                currentTenantSlug === context.whatsapp.activeClientSlug &&
                userLike.clientSlug === currentTenantSlug
            );
        }

        return {
            ...context,
            isMasterSite,
            isClientSite,
            isLocalHost,
            currentTenantSlug,
            isUserAllowedOnCurrentSite,
            canManageSharedWhatsApp,
        };
    }, [context]);

    return (
        <TenantContext.Provider value={value}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error('useTenant must be used within TenantProvider');
    }
    return ctx;
}
