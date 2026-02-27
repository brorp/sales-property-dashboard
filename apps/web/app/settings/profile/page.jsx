'use client';

import EditProfilePage from '../../../src/screens/EditProfilePage';
import { ProtectedRoute } from '../../../src/components/RouteGuards';

export default function EditProfileSettingsRoute() {
    return (
        <ProtectedRoute>
            <EditProfilePage />
        </ProtectedRoute>
    );
}
