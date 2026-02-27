'use client';

import DistributionOrderPage from '../../../src/screens/DistributionOrderPage';
import { AdminRoute } from '../../../src/components/RouteGuards';

export default function DistributionOrderRoute() {
    return (
        <AdminRoute>
            <DistributionOrderPage />
        </AdminRoute>
    );
}
