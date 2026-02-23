'use client';

import LeadsPage from '../../src/pages/LeadsPage';
import { ProtectedRoute } from '../../src/components/RouteGuards';

export default function LeadsRoute() {
    return (
        <ProtectedRoute>
            <LeadsPage />
        </ProtectedRoute>
    );
}
