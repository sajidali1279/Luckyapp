import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { AppSidebar } from './components/AppSidebar';
import { SidebarInset, SidebarProvider } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './components/NotFound';
import TopBar from './components/TopBar';
import { usePageTitle } from './hooks/usePageTitle';
import { lazyPage } from './lib/newRelease';

// Eagerly loaded (always needed)
import Login from './pages/Login';
import Privacy from './pages/Privacy';

// Lazy loaded (code-split per page)
const Dashboard              = lazyPage(() => import('./pages/Dashboard'));
const StoreManagerDashboard  = lazyPage(() => import('./pages/StoreManagerDashboard'));
const Billing                = lazyPage(() => import('./pages/Billing'));
const Settings               = lazyPage(() => import('./pages/Settings'));
const Analytics              = lazyPage(() => import('./pages/Analytics'));
const Offers                 = lazyPage(() => import('./pages/Offers'));
const Banners                = lazyPage(() => import('./pages/Banners'));
const Notices                = lazyPage(() => import('./pages/Notices'));
const Transactions           = lazyPage(() => import('./pages/Transactions'));
const Staff                  = lazyPage(() => import('./pages/Staff'));
const Customers              = lazyPage(() => import('./pages/Customers'));
const CustomerProfile        = lazyPage(() => import('./pages/CustomerProfile'));
const ActivityLog            = lazyPage(() => import('./pages/ActivityLog'));
const SuperAdminBilling      = lazyPage(() => import('./pages/SuperAdminBilling'));
const Notifications          = lazyPage(() => import('./pages/Notifications'));
const Stores                 = lazyPage(() => import('./pages/Stores'));
const Scheduling             = lazyPage(() => import('./pages/Scheduling'));
const Chat                   = lazyPage(() => import('./pages/Chat'));
const StoreRequests          = lazyPage(() => import('./pages/StoreRequests'));
const Profile                = lazyPage(() => import('./pages/Profile'));
const Catalog                = lazyPage(() => import('./pages/Catalog'));
const BusinessPromotions     = lazyPage(() => import('./pages/BusinessPromotions'));
const Rates                  = lazyPage(() => import('./pages/Rates'));
const Support                = lazyPage(() => import('./pages/Support'));
const Leaderboard            = lazyPage(() => import('./pages/Leaderboard'));
const Careers                = lazyPage(() => import('./pages/Careers'));
const OrderList              = lazyPage(() => import('./pages/OrderList'));
const ScannedProducts        = lazyPage(() => import('./pages/ScannedProducts'));
const Labels                 = lazyPage(() => import('./pages/Labels'));
const InventoryAnalytics     = lazyPage(() => import('./pages/InventoryAnalytics'));
const Documents              = lazyPage(() => import('./pages/Documents'));
const HotFood                = lazyPage(() => import('./pages/HotFood'));
const MissingPersons         = lazyPage(() => import('./pages/MissingPersons'));
const Engagement             = lazyPage(() => import('./pages/Engagement'));
const ComingSoon             = lazyPage(() => import('./pages/ComingSoon'));
const EmployeePortal         = lazyPage(() => import('./pages/EmployeePortal'));
const DailyReports           = lazyPage(() => import('./pages/DailyReports'));
const DailyTasks             = lazyPage(() => import('./pages/DailyTasks'));
const GrantRedeem            = lazyPage(() => import('./pages/GrantRedeem'));
const PdiInvoices            = lazyPage(() => import('./pages/PdiInvoices'));
const PdiInvoice             = lazyPage(() => import('./pages/PdiInvoice'));

// A 4xx (a refused form, an unauthorized or not-found request) will not succeed by asking again, so it is
// not retried; a network error, a timeout, or a real 5xx gets up to 2 more tries. A query that sets its own
// `retry` (several already do, for a count that would rather just show 0 than keep trying) is unaffected —
// this default only applies where a query does not say.
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== undefined && status < 500) return false;
  return failureCount < 2;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetryQuery } },
});

const ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER', 'EMPLOYEE'];

function ProtectedLayout() {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  usePageTitle();
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/login" replace />;
  if (user.role === 'EMPLOYEE') return <Navigate to="/employee-portal" replace />;
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <a href="#main-content" className="skip-link">Skip to the page content</a>
        <AppSidebar />
        <SidebarInset id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
          <TopBar />
          <div style={{
            minHeight: '100%',
            background: 'var(--background)',
          }}>
            {/* One page failing must not take the sidebar and every other page with it */}
            <ErrorBoundary resetKey={pathname} onReset={() => queryClient.clear()}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function DashboardRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'EMPLOYEE') return <Navigate to="/employee-portal" replace />;
  if (user?.role === 'STORE_MANAGER') return <StoreManagerDashboard />;
  return <Dashboard />;
}

function EmployeeLayout() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/login" replace />;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Outlet />
    </div>
  );
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
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<DashboardRoute />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/offers" element={<Offers />} />
              <Route path="/banners" element={<Banners />} />
              {/* Scheduling accessible to StoreManager+ */}
              <Route path="/scheduling" element={<Scheduling />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/store-requests" element={<StoreRequests />} />
              <Route path="/scanned-products" element={<ScannedProducts />} />
              <Route path="/inventory-analytics" element={<InventoryAnalytics />} />
              {/* Labels, Notices, Catalog, Daily Reports, Daily Tasks, and Support are all
                  accessible to StoreManager+ - mirrors mobile access / backend endpoints that
                  already scope down to the caller's own store for anyone below SuperAdmin. */}
              <Route path="/labels" element={<Labels />} />
              <Route path="/notices" element={<Notices />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/daily-reports" element={<DailyReports />} />
              <Route path="/daily-tasks" element={<DailyTasks />} />
              <Route path="/support" element={<Support />} />
              <Route element={<SuperAdminOnly />}>
                <Route path="/staff" element={<Staff />} />
                <Route path="/hot-food" element={<HotFood />} />
                <Route path="/missing-persons" element={<MissingPersons />} />
                <Route path="/engagement" element={<Engagement />} />
                <Route path="/hot-food/menu" element={<ComingSoon feature="Hot Food Menu Management" />} />
                <Route path="/hot-food/orders" element={<ComingSoon feature="Hot Food Order Board" />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:id" element={<CustomerProfile />} />
              <Route path="/grant-redeem" element={<GrantRedeem />} />
              <Route path="/pdi-invoices" element={<PdiInvoices />} />
              <Route path="/pdi-invoices/:id" element={<PdiInvoice />} />
                <Route path="/my-billing" element={<SuperAdminBilling />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/rates" element={<Rates />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/stores" element={<Stores />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                {/* Careers: write endpoints are SuperAdmin+ only server-side; this route gate
                    was previously missing, letting a Store Manager reach the page directly by
                    URL and see fully-enabled buttons that would 403 on click. */}
                <Route path="/careers" element={<Careers />} />
                {/* Order List admin view is a cross-store browsing/reporting tool backed by a
                    SuperAdmin-only endpoint (/order-lists/admin/all) - a Store Manager's real
                    order-list workflow (scan, quick-add, open/close their own store) already
                    lives on mobile; this page was never meant to serve that role. */}
                <Route path="/order-list" element={<OrderList />} />
              </Route>
              <Route path="/profile" element={<Profile />} />
              <Route path="/documents" element={<Documents />} />
              <Route element={<DevAdminOnly />}>
                <Route path="/billing" element={<Billing />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/promotions" element={<BusinessPromotions />} />
              </Route>
              {/* An address that does not exist says so (signed-out visitors are sent to sign in first) */}
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route element={<EmployeeLayout />}>
              <Route path="/employee-portal" element={<EmployeePortal />} />
            </Route>
          </Routes>
        </Suspense>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
