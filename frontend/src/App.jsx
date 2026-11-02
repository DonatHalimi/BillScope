import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthGuard, GuestGuard, RoleGuard, RootRedirect } from './auth/RouteGuards.jsx';
import { AppShell } from './layouts/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { AccountsPage } from './pages/AccountsPage.jsx';
import { TransactionsPage } from './pages/TransactionsPage.jsx';
import { TransfersPage } from './pages/TransfersPage.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { BudgetsPage } from './pages/BudgetsPage.jsx';
import { ForecastPage } from './pages/ForecastPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { ProviderPage } from './pages/ProviderPage.jsx';
import { CurrencyPage } from './pages/CurrencyPage.jsx';
import { RecurringPage } from './pages/RecurringPage.jsx';
import { FinancialHealthPage } from './pages/FinancialHealthPage.jsx';
import { HouseholdsPage } from './pages/HouseholdsPage.jsx';
import { AdminAuditPage } from './pages/AdminAuditPage.jsx';

export function App() {
  return <Routes>
    <Route path="/" element={<RootRedirect />} />
    <Route element={<GuestGuard />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>
    <Route element={<AuthGuard />}>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="currency" element={<CurrencyPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="financial-health" element={<FinancialHealthPage />} />
        <Route path="households" element={<HouseholdsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route element={<RoleGuard roles={['ADMIN']} />}>
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin/audit" element={<AdminAuditPage />} />
        </Route>
        <Route element={<RoleGuard roles={['PROVIDER', 'ADMIN']} />}>
          <Route path="provider" element={<ProviderPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
