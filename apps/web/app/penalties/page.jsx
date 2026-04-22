import PenaltiesPage from '../../src/screens/PenaltiesPage';
import { ProtectedRoute } from '../../src/components/RouteGuards';

export default function PenaltiesRoutePage() {
    return (
        <ProtectedRoute>
            <PenaltiesPage />
        </ProtectedRoute>
    );
}
