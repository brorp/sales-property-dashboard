'use client';

import DistributionOrderPage from '../../../src/screens/DistributionOrderPage';
import { RoleRoute } from '../../../src/components/RouteGuards';

export default function DistributionOrderRoute() {
    return (
        <RoleRoute allowedRoles={['client_admin']}>
            <DistributionOrderPage />
        </RoleRoute>
    );
}
