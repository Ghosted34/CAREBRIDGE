import { Link, Route, Routes } from 'react-router';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui';
import { NotificationsPage } from './features/account/NotificationsPage';
import { AuditLogsPage } from './features/admin/AuditLogsPage';
import { OverviewPage } from './features/admin/OverviewPage';
import { ProvidersAdminPage } from './features/admin/ProvidersAdminPage';
import { SlaDashboardPage } from './features/admin/SlaDashboardPage';
import { UsersPage } from './features/admin/UsersPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { NewRequestPage } from './features/patient/NewRequestPage';
import { PatientAppointmentsPage } from './features/patient/PatientAppointmentsPage';
import { PatientHomePage } from './features/patient/PatientHomePage';
import { PrivacyPage } from './features/patient/PrivacyPage';
import { PoliciesPage } from './features/public/PoliciesPage';
import { RequestDetailPage } from './features/patient/RequestDetailPage';
import { CapacityPage } from './features/provider/CapacityPage';
import { JourneysPage } from './features/provider/JourneysPage';
import { ProviderAppointmentsPage } from './features/provider/ProviderAppointmentsPage';
import { ProviderRequestsPage } from './features/provider/ProviderRequestsPage';
import { ReferralsPage } from './features/provider/ReferralsPage';
import { FeePage } from './features/provider/FeePage';
import { TeamPage } from './features/provider/TeamPage';
import { HomePage } from './features/public/HomePage';
import { ProvidersPage } from './features/public/ProvidersPage';

const patient = (el: React.ReactNode) => <RequireRole roles={['patient']}>{el}</RequireRole>;
const provider = (el: React.ReactNode) => (
  <RequireRole roles={['provider_staff']}>{el}</RequireRole>
);
const ops = (el: React.ReactNode) => <RequireRole roles={['operator', 'admin']}>{el}</RequireRole>;
const adminOnly = (el: React.ReactNode) => <RequireRole roles={['admin']}>{el}</RequireRole>;

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route
          path="notifications"
          element={
            <RequireRole roles={['patient', 'provider_staff', 'operator', 'admin']}>
              <NotificationsPage />
            </RequireRole>
          }
        />
        <Route
          path="account/privacy"
          element={
            <RequireRole roles={['patient', 'provider_staff', 'operator', 'admin']}>
              <PrivacyPage />
            </RequireRole>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route path="patient" element={patient(<PatientHomePage />)} />
        <Route path="patient/new" element={patient(<NewRequestPage />)} />
        <Route path="patient/requests/:id" element={patient(<RequestDetailPage />)} />
        <Route path="patient/appointments" element={patient(<PatientAppointmentsPage />)} />

        <Route path="provider" element={provider(<ProviderRequestsPage />)} />
        <Route path="provider/patients" element={provider(<JourneysPage />)} />
        <Route path="provider/appointments" element={provider(<ProviderAppointmentsPage />)} />
        <Route path="provider/capacity" element={provider(<CapacityPage />)} />
        <Route path="provider/referrals" element={provider(<ReferralsPage />)} />
        <Route path="provider/team" element={provider(<TeamPage />)} />
        <Route path="provider/fees" element={provider(<FeePage />)} />

        <Route path="ops" element={ops(<OverviewPage />)} />
        <Route path="ops/queue" element={ops(<ProviderRequestsPage />)} />
        <Route path="ops/journeys" element={ops(<JourneysPage />)} />
        <Route path="ops/sla" element={ops(<SlaDashboardPage />)} />
        <Route path="ops/audit-logs" element={ops(<AuditLogsPage />)} />
        <Route path="ops/providers" element={ops(<ProvidersAdminPage />)} />
        <Route path="ops/users" element={adminOnly(<UsersPage />)} />

        <Route
          path="*"
          element={
            <EmptyState title="Page not found">
              <Link to="/">Go home</Link>
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}
