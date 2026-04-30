'use client';

import ReassignedLeadsPage from '../../../src/screens/ReassignedLeadsPage';
import { RoleRoute } from '../../../src/components/RouteGuards';

export default function ReassignedLeadsRoute() {
    return (
        <RoleRoute allowedRoles={['root_admin', 'client_admin']}>
            <ReassignedLeadsPage />
        </RoleRoute>
    );
}
