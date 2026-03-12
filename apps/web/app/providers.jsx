'use client';

import { AuthProvider } from '../src/context/AuthContext';
import { LeadsProvider } from '../src/context/LeadsContext';
import { TenantProvider } from '../src/context/TenantContext';

export default function Providers({ children }) {
    return (
        <TenantProvider>
            <AuthProvider>
                <LeadsProvider>{children}</LeadsProvider>
            </AuthProvider>
        </TenantProvider>
    );
}
