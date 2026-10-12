import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

function RouteLoading() {
  return <div className="grid min-h-screen place-items-center bg-canvas text-sm text-muted-foreground" role="status">Loading your secure session…</div>;
}

export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <RouteLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function GuestGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <RouteLoading />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function RoleGuard({ roles }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <RouteLoading />;
  return <Navigate to={isAuthenticated ? '/app' : '/login'} replace />;
}
