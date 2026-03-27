'use client';

import CancelReasonsPage from '../../../src/screens/CancelReasonsPage';
import { RoleRoute } from '../../../src/components/RouteGuards';

export default function CancelReasonsSettingsRoute() {
    return (
        <RoleRoute allowedRoles={['client_admin', 'root_admin']}>
            <CancelReasonsPage />
        </RoleRoute>
    );
}
