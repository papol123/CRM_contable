'use client';

import React, { useState, useEffect } from 'react';
import styles from '../dashboard.module.css';
import { AuthUser, refreshRequest, getMeRequest } from '@/lib/auth';
import { fetchUsers, ApiException } from '@/lib/api';

interface UserDashboardProps {
  initialUser: AuthUser;
}

export default function UserDashboard({ initialUser }: UserDashboardProps) {
  const [userProfile, setUserProfile] = useState<AuthUser>(initialUser);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTestingRbac, setIsTestingRbac] = useState(false);
  const [securityTestResult, setSecurityTestResult] = useState<{
    status: 'success' | 'blocked' | null;
    message: string;
    details?: string;
  }>({ status: null, message: '' });

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Sync profile if initialUser changes
  useEffect(() => {
    setUserProfile(initialUser);
  }, [initialUser]);

  // GET: Refresh profile information directly from /auth/me
  async function handleReloadProfile() {
    setIsRefreshing(true);
    try {
      const data = await getMeRequest();
      setUserProfile(data);
      setNotification({
        type: 'success',
        text: 'Perfil de usuario actualizado exitosamente desde el backend (GET /auth/me).',
      });
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al consultar perfil del backend.',
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  // POST: Execute token renewal request (/auth/refresh)
  async function handleRefreshToken() {
    setIsRefreshing(true);
    setNotification(null);
    try {
      const res = await refreshRequest();
      setNotification({
        type: 'success',
        text: `Sesión y token renovados exitosamente (POST /auth/refresh). Válido por ${res.expiresIn} segundos.`,
      });
      // Also update profile state with refreshed user
      if (res.user) {
        setUserProfile(res.user);
      }
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al renovar la sesión.',
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  // Interactive RBAC test: try calling GET /users (which requires 'usuarios.gestionar')
  async function handleTestRbacSecurity() {
    setIsTestingRbac(true);
    setSecurityTestResult({ status: null, message: '' });
    try {
      await fetchUsers();
      // If it succeeded (which should not happen for a regular user)
      setSecurityTestResult({
        status: 'success',
        message: 'Acceso concedido a /users.',
        details: 'El endpoint respondió satisfactoriamente.',
      });
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setSecurityTestResult({
          status: 'blocked',
          message: `Bloqueo de Seguridad Correcto: HTTP ${err.statusCode}`,
          details: `${err.message} (El backend protege correctamente los recursos administrativos de usuarios).`,
        });
      } else {
        setSecurityTestResult({
          status: 'blocked',
          message: 'Petición rechazada por el servidor.',
          details: err instanceof Error ? err.message : 'Error de comunicación',
        });
      }
    } finally {
      setIsTestingRbac(false);
    }
  }

  const permissions = userProfile.permisos || [];
  const rolName = typeof userProfile.rol === 'string' ? userProfile.rol : (userProfile.rol?.nombre || 'USUARIO');

  return (
    <>
      {/* Banner de Bienvenida Personalizado */}
      <div className={styles.headerBanner}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <span className={`${styles.roleTag} ${styles.roleTagUser}`}>
              💼 Rol Operativo ({rolName})
            </span>
          </div>
          <h1 className={styles.headerBannerTitle}>
            Portal Operativo de Trabajo
          </h1>
          <p className={styles.headerBannerDesc}>
            Bienvenido al espacio de operaciones del CRM Contable. Aquí puedes consultar tu información autorizada, revisar tus capacidades asignadas y validar el estado de tu sesión.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            id="btn-refresh-profile"
            type="button"
            className={styles.btnSecondary}
            onClick={handleReloadProfile}
            disabled={isRefreshing}
          >
            {isRefreshing ? <span className={styles.spinner} /> : '↻'} Sincronizar Perfil
          </button>
          <button
            id="btn-refresh-token"
            type="button"
            className={styles.btnPrimary}
            onClick={handleRefreshToken}
            disabled={isRefreshing}
          >
            {isRefreshing && <span className={styles.spinner} />}
            ⚡ Renovar Sesión (POST)
          </button>
        </div>
      </div>

      {/* Alertas */}
      {notification && (
        <div
          className={`${styles.alert} ${
            notification.type === 'success'
              ? styles.alertSuccess
              : notification.type === 'error'
              ? styles.alertError
              : styles.alertInfo
          }`}
          role="status"
        >
          <span>{notification.type === 'success' ? '✅' : '⚠️'} {notification.text}</span>
          <button
            type="button"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setNotification(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tarjeta de Identidad y Sesión Activa */}
      <section className={styles.userProfileCard}>
        <div className={styles.userBigAvatar}>
          {userProfile.nombres?.[0]?.toUpperCase() || 'U'}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc' }}>
              {userProfile.nombres} {userProfile.apellidos}
            </h2>
            <span className={`${styles.statusBadge} ${styles.statusActive}`}>
              Sesión Autenticada
            </span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            {userProfile.email}
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>ID DE USUARIO</span>
              <code style={{ fontSize: '0.8rem', color: '#a5b4fc', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: 4 }}>
                {userProfile.id}
              </code>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>ROL DE SEGURIDAD</span>
              <strong style={{ fontSize: '0.85rem', color: '#6ee7b7' }}>{rolName}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>PERMISOS ACTIVOS</span>
              <strong style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{permissions.length} capacidades</strong>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={`${styles.roleTag} ${styles.roleTagUser}`} style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
            ✓ Acceso Operativo
          </span>
        </div>
      </section>

      {/* Módulos y Funciones Permitidas para este Rol */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <h2 className={styles.cardTitle}>Capacidades Operativas Permitidas</h2>
              <p className={styles.cardSubtitle}>
                Funciones autorizadas en el sistema para tu perfil de usuario ({rolName})
              </p>
            </div>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.moduleGrid}>
            {/* Ventas */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>📈</span>
                <span className={styles.moduleTitle}>Ventas y Facturación</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Generación y consulta de facturas de venta y cotizaciones a clientes.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>ventas.consultar</span>
                <span className={styles.permissionTag}>ventas.crear</span>
              </div>
            </div>

            {/* Compras */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>🛒</span>
                <span className={styles.moduleTitle}>Compras y Proveedores</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Registro y seguimiento de órdenes y facturas de adquisición de repuestos.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>compras.consultar</span>
                <span className={styles.permissionTag}>compras.crear</span>
              </div>
            </div>

            {/* Inventario */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>📦</span>
                <span className={styles.moduleTitle}>Inventario y Repuestos</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Consulta de catálogo de piezas, stock por bodega y referencias cruzadas.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>inventario.consultar</span>
              </div>
            </div>

            {/* Cartera */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>💼</span>
                <span className={styles.moduleTitle}>Cartera y Cuentas</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Consulta de saldos de clientes, cupos de crédito y días de plazo.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>cartera.consultar</span>
              </div>
            </div>

            {/* Pagos */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>💳</span>
                <span className={styles.moduleTitle}>Recaudos y Pagos</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Registro de cobros recibidos de clientes y pagos aplicados a facturas.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>pagos.registrar</span>
              </div>
            </div>

            {/* Terceros */}
            <div className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span style={{ fontSize: '1.25rem' }}>👥</span>
                <span className={styles.moduleTitle}>Gestión de Terceros</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Consulta, creación y actualización de datos de clientes y contactos.
              </p>
              <div className={styles.permissionTagList}>
                <span className={styles.permissionTag}>terceros.consultar</span>
                <span className={styles.permissionTag}>terceros.crear</span>
                <span className={styles.permissionTag}>terceros.editar</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Restricciones y Prueba Interactiva de Seguridad RBAC */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="2">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <h2 className={styles.cardTitle}>Restricciones de Rol y Verificación de Seguridad</h2>
              <p className={styles.cardSubtitle}>
                Control estricto de autorización (RBAC) validado en el servidor mediante Guards
              </p>
            </div>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'rgba(244, 63, 94, 0.04)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
              <div style={{ color: '#fb7185', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                ⛔ Anulación de Documentos
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                No tienes permisos para anular facturas, compras ni pagos aplicados (exclusivo Administrador).
              </p>
            </div>

            <div style={{ background: 'rgba(244, 63, 94, 0.04)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
              <div style={{ color: '#fb7185', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                ⛔ Gestión de Usuarios y Roles
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                No puedes crear nuevos usuarios, editar datos de terceros de acceso ni dar de baja cuentas.
              </p>
            </div>

            <div style={{ background: 'rgba(244, 63, 94, 0.04)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
              <div style={{ color: '#fb7185', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                ⛔ Cierres y Márgenes de Costos
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                La visualización de costos de compra, márgenes de ganancia y cierres contables está restringida.
              </p>
            </div>
          </div>

          {/* Prueba en tiempo real de RBAC hacia el backend */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#f1f5f9' }}>
                  Prueba de Enforzamiento RBAC en Vivo (GET /api/v1/users)
                </strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                  Envía una solicitud HTTP real al endpoint protegido para verificar que el servidor devuelve 403 Forbidden.
                </p>
              </div>

              <button
                id="btn-test-rbac"
                type="button"
                className={styles.btnSecondary}
                onClick={handleTestRbacSecurity}
                disabled={isTestingRbac}
              >
                {isTestingRbac && <span className={styles.spinner} />}
                {isTestingRbac ? 'Consultando...' : '🔍 Probar Endpoint Protegido'}
              </button>
            </div>

            {securityTestResult.status && (
              <div
                className={`${styles.alert} ${
                  securityTestResult.status === 'blocked' ? styles.alertSuccess : styles.alertError
                }`}
                style={{ marginBottom: 0 }}
              >
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem' }}>
                    {securityTestResult.message}
                  </strong>
                  <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                    {securityTestResult.details}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
