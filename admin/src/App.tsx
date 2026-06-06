import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { AppSidebar } from './components/AppSidebar';
import { SidebarInset, SidebarProvider } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import PageLoader from './components/PageLoader';

// Eagerly loaded (always needed)
import Login from './pages/Login';
import Privacy from './pages/Privacy';

// Lazy loaded (code-split per page)
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const StoreManagerDashboard  = lazy(() => import('./pages/StoreManagerDashboard'));
const Billing                = lazy(() => import('./pages/Billing'));
const Analytics              = lazy(() => import('./pages/Analytics'));
const Offers                 = lazy(() => import('./pages/Offers'));
const Banners                = lazy(() => import('./pages/Banners'));
const Transactions           = lazy(() => import('./pages/Transactions'));
const Staff                  = lazy(() => import('./pages/Staff'));
const Customers              = lazy(() => import('./pages/Customers'));
const ActivityLog            = lazy(() => import('./pages/ActivityLog'));
const SuperAdminBilling      = lazy(() => import('./pages/SuperAdminBilling'));
const Notifications          = lazy(() => import('./pages/Notifications'));
const Stores                 = lazy(() => import('./pages/Stores'));
const Scheduling             = lazy(() => import('./pages/Scheduling'));
const Chat                   = lazy(() => import('./pages/Chat'));
const StoreRequests          = lazy(() => import('./pages/StoreRequests'));
const Profile                = lazy(() => import('./pages/Profile'));
const Catalog                = lazy(() => import('./pages/Catalog'));
const BusinessPromotions     = lazy(() => import('./pages/BusinessPromotions'));
const Rates                  = lazy(() => import('./pages/Rates'));
const Support                = lazy(() => import('./pages/Support'));
const Leaderboard            = lazy(() => import('./pages/Leaderboard'));
const Careers                = lazy(() => import('./pages/Careers'));
const OrderList              = lazy(() => import('./pages/OrderList'));
const InventoryAnalytics     = lazy(() => import('./pages/InventoryAnalytics'));
const Documents              = lazy(() => import('./pages/Documents'));
const HotFood                = lazy(() => import('./pages/HotFood'));
const HotFoodMenu            = lazy(() => import('./pages/HotFoodMenu'));
const HotFoodOrders          = lazy(() => import('./pages/HotFoodOrders'));

const queryClient = new QueryClient();

const ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'];

function ProtectedLayout() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/login" replace />;
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div style={{
            minHeight: '100%',
            background: 'oklch(0.962 0.005 80)',
          }}>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<DashboardRoute />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/offers" element={<Offers />} />
              <Route path="/banners" element={<Banners />} />
              {/* Scheduling accessible to StoreManager+ */}
              <Route path="/scheduling" element={<Scheduling />} />
              <Route element={<SuperAdminOnly />}>
                <Route path="/hot-food" element={<HotFood />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/my-billing" element={<SuperAdminBilling />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/rates" element={<Rates />} />
                <Route path="/support" element={<Support />} />
                <Route path="/stores" element={<Stores />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
              </Route>
              {/* Catalog accessible to both SuperAdmin and DevAdmin */}
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/store-requests" element={<StoreRequests />} />
              <Route path="/order-list" element={<OrderList />} />
              <Route path="/inventory-analytics" element={<InventoryAnalytics />} />
              <Route path="/hot-food/menu" element={<HotFoodMenu />} />
              <Route path="/hot-food/orders" element={<HotFoodOrders />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/documents" element={<Documents />} />
              <Route element={<DevAdminOnly />}>
                <Route path="/billing" element={<Billing />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/promotions" element={<BusinessPromotions />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
