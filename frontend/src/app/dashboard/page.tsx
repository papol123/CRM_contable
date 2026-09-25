'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './dashboard.module.css';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  // Guard: redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  // Determine if the current user has the Administrator role or permission
  const { isAdmin, roleCode, roleName } = useMemo(() => {
    if (!user) return { isAdmin: false, roleCode: '', roleName: '' };

    const code =
      typeof user.rol === 'string'
        ? user.rol.toUpperCase()
        : (user.rol?.nombre || '').toUpperCase();

    const hasGestionarUsers = user.permisos?.includes('usuarios.gestionar') ?? false;
    const admin = code === 'ADMIN' || hasGestionarUsers;

    const displayRole = admin ? 'ADMIN' : 'USUARIO';
    const displayName = admin ? 'Administrador' : 'Usuario Operativo';

    return { isAdmin: admin, roleCode: displayRole, roleName: displayName };
  }, [user]);

  // Loading state
  if (isLoading || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        gap: '1rem',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTop: '3px solid #6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Verificando sesión en el CRM Contable...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const userInitial = user.nombres?.[0]?.toUpperCase() || 'U';

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
              <path d="M6.5 6.5h.01M17.5 6.5h.01M17.5 17.5h.01M6.5 17.5h.01" strokeWidth="3" />
            </svg>
          </div>
          <div>
            <div className={styles.brandTitle}>CRM Contable</div>
            <div className={styles.brandSubtitle}>Repuestos Automotrices</div>
          </div>
        </div>

        <div className={styles.navActions}>
          {/* User info badge */}
          <div className={styles.userBadge}>
            <div
              className={styles.userAvatar}
              style={{
                background: isAdmin
                  ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
            >
              {userInitial}
            </div>
            <div>
              <div className={styles.userName}>
                {user.nombres} {user.apellidos}
              </div>
            </div>
            <span
              className={`${styles.roleTag} ${
                isAdmin ? styles.roleTagAdmin : styles.roleTagUser
              }`}
            >
              {roleName}
            </span>
          </div>

          {/* Logout button */}
          <button
            id="btn-logout"
            type="button"
            className={styles.btnLogout}
            onClick={handleLogout}
            title="Cerrar sesión segura"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      {/* Main Content Area: Renders the appropriate role-based dashboard */}
      <main className={styles.main}>
        {isAdmin ? (
          <AdminDashboard />
        ) : (
          <UserDashboard initialUser={user} />
        )}
      </main>
    </div>
  );
}
