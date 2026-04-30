'use client';

import LeadSourcesPage from '../../../src/screens/LeadSourcesPage';
import { RoleRoute } from '../../../src/components/RouteGuards';

export default function LeadSourcesSettingsRoute() {
    return (
        <RoleRoute allowedRoles={['client_admin', 'root_admin']}>
            <LeadSourcesPage />
        </RoleRoute>
    );
}
