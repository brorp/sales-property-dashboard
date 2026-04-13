'use client';

import { AuthProvider } from '../src/context/AuthContext';
import { LeadsProvider } from '../src/context/LeadsContext';
import { TenantProvider } from '../src/context/TenantContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';

export default function Providers({ children }) {
    return (
        <WorkspaceProvider>
            <TenantProvider>
                <AuthProvider>
                    <LeadsProvider>{children}</LeadsProvider>
                </AuthProvider>
            </TenantProvider>
        </WorkspaceProvider>
    );
}
