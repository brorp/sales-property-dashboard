'use client';

import OverviewPage from '../../src/screens/OverviewPage';
import { RoleRoute } from '../../src/components/RouteGuards';

export default function OverviewRoutePage() {
    return (
        <RoleRoute allowedRoles={['admin', 'client_admin', 'root_admin']}>
            <OverviewPage />
        </RoleRoute>
    );
}
