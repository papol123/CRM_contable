'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// ─── Minimal dashboard placeholder ───────────────────────────────────────────

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

  if (isLoading || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}>
        <div style={{
          width: '36px', height: '36px',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTop: '3px solid #6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'rgba(19,21,42,0.85)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: '20px',
        padding: '2.5rem 3rem',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        {/* Welcome badge */}
        <div style={{
          display: 'inline-block',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '999px',
          padding: '0.35rem 1rem',
          fontSize: '0.8rem',
          color: '#818cf8',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '1.25rem',
        }}>
          ✓ Sesión activa
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f1f5f9' }}>
          ¡Bienvenido de nuevo!
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
          {user.nombres} {user.apellidos}
        </p>

        {/* User info card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(99,102,241,0.12)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '2rem',
          textAlign: 'left',
        }}>
          <InfoRow label="Correo" value={user.email} />
          <InfoRow label="Rol" value={user.rol?.nombre ?? '—'} />
        </div>

        {/* Logout */}
        <button
          id="btn-logout"
          onClick={handleLogout}
          style={{
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: '8px',
            padding: '0.7rem 1.5rem',
            color: '#f43f5e',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.12)')}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
