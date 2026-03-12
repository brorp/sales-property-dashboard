'use client';

import UnitsPage from '../../../src/screens/UnitsPage';
import { RoleRoute } from '../../../src/components/RouteGuards';

export default function UnitsSettingsRoute() {
    return (
        <RoleRoute allowedRoles={['client_admin']}>
            <UnitsPage />
        </RoleRoute>
    );
}
