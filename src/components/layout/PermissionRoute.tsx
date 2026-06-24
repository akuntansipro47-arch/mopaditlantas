import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { hasAnyMenuAccess, hasAnyReportAccess, isSuperAdmin } from '@/lib/permissions';

type PermissionRouteProps = {
  children: ReactNode;
  permissions?: string[];
  requireReports?: boolean;
  requireSuperAdmin?: boolean;
  title?: string;
  description?: string;
};

export default function PermissionRoute({
  children,
  permissions,
  requireReports = false,
  requireSuperAdmin = false,
  title = 'Akses Ditolak',
  description = 'Anda tidak memiliki izin untuk membuka halaman ini.',
}: PermissionRouteProps) {
  const { user, loading, refreshCurrentUser } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user || loading) return;
    void refreshCurrentUser();
  }, [user, loading, refreshCurrentUser, location.pathname, location.search]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-lg font-medium text-slate-600">Memuat hak akses...</div>
      </div>
    );
  }

  let allowed = false;
  if (requireSuperAdmin) {
    allowed = isSuperAdmin(user);
  } else if (requireReports) {
    allowed = hasAnyReportAccess(user);
  } else if (permissions && permissions.length > 0) {
    allowed = hasAnyMenuAccess(user, permissions);
  } else {
    allowed = !!user;
  }

  if (allowed) return <>{children}</>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
      </Card>
    </div>
  );
}
