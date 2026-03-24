import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Analytics from './pages/Analytics';
import Offers from './pages/Offers';
import Banners from './pages/Banners';
import Transactions from './pages/Transactions';
import Staff from './pages/Staff';
import Customers from './pages/Customers';
import StoreManagerDashboard from './pages/StoreManagerDashboard';
import ActivityLog from './pages/ActivityLog';
import SuperAdminBilling from './pages/SuperAdminBilling';
import Notifications from './pages/Notifications';
import Stores from './pages/Stores';
import Scheduling from './pages/Scheduling';

const queryClient = new QueryClient();

const ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'];

function ProtectedLayout() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function DashboardRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'STORE_MANAGER') return <StoreManagerDashboard />;
  return <Dashboard />;
}

function DevAdminOnly() {
  const { user } = useAuthStore();
  if (user?.role !== 'DEV_ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}

function SuperAdminOnly() {
  const { user } = useAuthStore();
  if (!['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '')) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardRoute />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/banners" element={<Banners />} />
            <Route element={<SuperAdminOnly />}>
              <Route path="/customers" element={<Customers />} />
              <Route path="/my-billing" element={<SuperAdminBilling />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/scheduling" element={<Scheduling />} />
            </Route>
            <Route element={<DevAdminOnly />}>
              <Route path="/billing" element={<Billing />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/stores" element={<Stores />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
