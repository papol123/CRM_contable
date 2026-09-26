'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from '../dashboard.module.css';
import { AuthUser, setToken, removeToken } from '@/lib/auth';
import { requestInspect, HttpResponseDetail } from '@/lib/api';

interface UserDashboardProps {
  initialUser: AuthUser;
}

// Descripción y alcance de cada capacidad operativa asignada al rol
const PERMISSION_DETAILS: Record<string, { modulo: string; titulo: string; descripcion: string; operaciones: string[] }> = {
  'ventas.consultar': {
    modulo: 'Ventas y Facturación',
    titulo: 'Consulta de Facturas y Cotizaciones',
    descripcion: 'Permite buscar, listar y consultar el detalle de facturas de venta, cotizaciones y pedidos emitidos.',
    operaciones: ['Listar facturas emitidas', 'Ver detalle de líneas de factura', 'Descargar comprobante PDF / XML'],
  },
  'ventas.crear': {
    modulo: 'Ventas y Facturación',
    titulo: 'Emisión de Facturas y Cotizaciones',
    descripcion: 'Permite registrar nuevas cotizaciones y facturas electrónicas para repuestos automotrices con cálculo de IVA.',
    operaciones: ['Crear cotización a clientes', 'Generar factura de venta DIAN', 'Aplicar listas de precios oficiales'],
  },
  'compras.consultar': {
    modulo: 'Compras y Proveedores',
    titulo: 'Consulta de Documentos de Adquisición',
    descripcion: 'Permite consultar el historial de órdenes de compra y facturas de adquisición de repuestos con proveedores.',
    operaciones: ['Consultar compras por proveedor', 'Ver estado de recepción de mercancía', 'Revisar líneas de costo unitario'],
  },
  'compras.crear': {
    modulo: 'Compras y Proveedores',
    titulo: 'Registro de Compras a Proveedores',
    descripcion: 'Permite ingresar nuevas facturas de compra para reabastecimiento del catálogo de repuestos automotrices.',
    operaciones: ['Crear orden de compra', 'Registrar factura de proveedor', 'Actualizar entrada a bodega'],
  },
  'inventario.consultar': {
    modulo: 'Inventario y Catálogo',
    titulo: 'Consulta de Stock y Repuestos',
    descripcion: 'Permite buscar en el catálogo maestro repuestos por SKU, código OEM, marca y disponibilidad por bodega.',
    operaciones: ['Buscar repuestos por código o marca', 'Consultar stock disponible por bodega', 'Ver referencias cruzadas'],
  },
  'cartera.consultar': {
    modulo: 'Cartera y Clientes',
    titulo: 'Consulta de Saldos y Vencimientos',
    descripcion: 'Permite verificar el estado de cuenta de clientes, días de crédito autorizados y facturas pendientes de cobro.',
    operaciones: ['Consultar saldo pendiente por cliente', 'Verificar cupo de crédito otorgado', 'Listar facturas por vencer'],
  },
  'pagos.registrar': {
    modulo: 'Recaudos y Pagos',
    titulo: 'Registro de Recaudos y Abonos',
    descripcion: 'Permite asentar los pagos recibidos de clientes en efectivo, transferencia o datáfono contra facturas emitidas.',
    operaciones: ['Registrar recibo de caja', 'Aplicar abono a facturas de venta', 'Generar comprobante de pago'],
  },
  'terceros.consultar': {
    modulo: 'Gestión de Terceros',
    titulo: 'Consulta de Directorio de Clientes y Proveedores',
    descripcion: 'Permite buscar terceros por número de documento (NIT/CC), razón social o teléfono de contacto.',
    operaciones: ['Buscar cliente por NIT o cédula', 'Consultar información tributaria (RUT)', 'Ver historial de compras del cliente'],
  },
  'terceros.crear': {
    modulo: 'Gestión de Terceros',
    titulo: 'Registro de Nuevos Terceros',
    descripcion: 'Permite dar de alta a nuevos clientes o proveedores con sus datos fiscales y comerciales en el sistema.',
    operaciones: ['Crear ficha de cliente nuevo', 'Asociar tipo de régimen y ciudad', 'Configurar plazo de crédito comercial'],
  },
  'terceros.editar': {
    modulo: 'Gestión de Terceros',
    titulo: 'Actualización de Datos de Terceros',
    descripcion: 'Permite modificar números telefónicos, direcciones de despacho y contactos comerciales autorizados.',
    operaciones: ['Actualizar dirección de entrega', 'Modificar teléfono y correo de facturación', 'Actualizar lista de contactos'],
  },
};

// Catálogo de módulos de negocio para validación de endpoints
interface BusinessModuleCheck {
  id: string;
  modulo: string;
  icono: string;
  endpointPrevisto: string;
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  descripcion: string;
  permisoRequerido: string;
  sampleBody?: unknown;
}

const BUSINESS_MODULES: BusinessModuleCheck[] = [
  {
    id: 'terceros-get',
    modulo: 'Terceros (Clientes)',
    icono: '👥',
    endpointPrevisto: '/terceros',
    metodo: 'GET',
    descripcion: 'Consulta de lista de clientes y proveedores registrados en la base de datos.',
    permisoRequerido: 'terceros.consultar',
  },
  {
    id: 'terceros-post',
    modulo: 'Terceros (Crear)',
    icono: '👥',
    endpointPrevisto: '/terceros',
    metodo: 'POST',
    descripcion: 'Alta de un nuevo cliente comercial en la base de datos.',
    permisoRequerido: 'terceros.crear',
    sampleBody: {
      tipoDocumento: 'NIT',
      numeroDocumento: '901234567-8',
      razonSocial: 'Taller Automotriz Ejemplo SAS',
      email: 'contacto@taller.com',
      telefono: '3157778899',
    },
  },
  {
    id: 'inventario-get',
    modulo: 'Inventario y Repuestos',
    icono: '📦',
    endpointPrevisto: '/inventario',
    metodo: 'GET',
    descripcion: 'Consulta de existencias físicas de repuestos y ubicación en bodegas.',
    permisoRequerido: 'inventario.consultar',
  },
  {
    id: 'ventas-get',
    modulo: 'Ventas y Facturación',
    icono: '📈',
    endpointPrevisto: '/ventas/facturas',
    metodo: 'GET',
    descripcion: 'Historial de facturas electrónicas de venta emitidas.',
    permisoRequerido: 'ventas.consultar',
  },
  {
    id: 'ventas-post',
    modulo: 'Ventas y Facturación',
    icono: '📈',
    endpointPrevisto: '/ventas/facturas',
    metodo: 'POST',
    descripcion: 'Generación de una nueva factura electrónica con resolución DIAN.',
    permisoRequerido: 'ventas.crear',
    sampleBody: {
      idCliente: 'uuid-cliente-ejemplo',
      formaPago: 'CONTADO',
      items: [{ idRepuesto: 'uuid-filtro', cantidad: 2, precioUnitario: 45000 }],
    },
  },
  {
    id: 'compras-get',
    modulo: 'Compras y Proveedores',
    icono: '🛒',
    endpointPrevisto: '/compras',
    metodo: 'GET',
    descripcion: 'Consulta de órdenes de compra y facturas de adquisición.',
    permisoRequerido: 'compras.consultar',
  },
  {
    id: 'cartera-get',
    modulo: 'Cartera y Cobranzas',
    icono: '💼',
    endpointPrevisto: '/cartera',
    metodo: 'GET',
    descripcion: 'Consulta de saldos de clientes y cuentas por cobrar.',
    permisoRequerido: 'cartera.consultar',
  },
  {
    id: 'pagos-post',
    modulo: 'Recaudos y Pagos',
    icono: '💳',
    endpointPrevisto: '/pagos',
    metodo: 'POST',
    descripcion: 'Registro de recibo de caja y abono a factura.',
    permisoRequerido: 'pagos.registrar',
    sampleBody: {
      idFactura: 'uuid-factura-ejemplo',
      monto: 90000,
      medioPago: 'TRANSFERENCIA',
    },
  },
];

export default function UserDashboard({ initialUser }: UserDashboardProps) {
  // ─── Estado del Perfil y Usuario ──────────────────────────────────────────
  const [userProfile, setUserProfile] = useState<AuthUser>(initialUser);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState<'capacidades' | 'seguridad' | 'modulos' | 'historial'>('capacidades');

  // ─── Inspector de Respuestas HTTP en Tiempo Real ──────────────────────────
  const [latestResponse, setLatestResponse] = useState<HttpResponseDetail | null>(null);
  const [httpHistory, setHttpHistory] = useState<HttpResponseDetail[]>([]);
  const [searchPermission, setSearchPermission] = useState('');

  // ─── Alertas Visuales ─────────────────────────────────────────────────────
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    code?: number;
  } | null>(null);

  // ─── Modales ──────────────────────────────────────────────────────────────
  const [selectedPermission, setSelectedPermission] = useState<{ codigo: string; modulo: string; titulo: string; descripcion: string; operaciones: string[] } | null>(null);
  const [showRawProfileModal, setShowRawProfileModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showRbacCreateModal, setShowRbacCreateModal] = useState(false);
  const [showRbacEditModal, setShowRbacEditModal] = useState(false);
  const [showUpdateProfileModal, setShowUpdateProfileModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  // Formularios de modales
  const [rbacUserIdInput, setRbacUserIdInput] = useState('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  const [rbacFormData, setRbacFormData] = useState({
    email: 'hacker.prueba@ejemplo.com',
    password: 'Password123*',
    nombres: 'Intruso',
    apellidos: 'No Autorizado',
    telefono: '3001112233',
    idRol: 'dcbb54ed-8b98-4517-938b-d96e7e8f0c60',
  });
  const [profileFormData, setProfileFormData] = useState({
    nombres: initialUser.nombres || '',
    apellidos: initialUser.apellidos || '',
    telefono: '3109876543',
  });
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: 'Admin123*',
    newPassword: 'NuevaPassword456*',
  });

  // Sincronizar estado si las props cambian
  useEffect(() => {
    setUserProfile(initialUser);
    setProfileFormData({
      nombres: initialUser.nombres || '',
      apellidos: initialUser.apellidos || '',
      telefono: '3109876543',
    });
  }, [initialUser]);

  // Helper central para registrar peticiones en el Inspector e Historial
  const recordResponse = useCallback((res: HttpResponseDetail) => {
    setLatestResponse(res);
    setHttpHistory((prev) => [res, ...prev.slice(0, 19)]); // Guardar las últimas 20
  }, []);

  // ─── 1. ACCIÓN: GET /auth/me (Consultar Perfil) ────────────────────────────
  const handleReloadProfile = useCallback(async () => {
    setIsExecuting(true);
    setNotification(null);
    try {
      const res = await requestInspect<AuthUser>('/auth/me');
      recordResponse(res);

      if (res.statusCode === 200 && res.data) {
        setUserProfile(res.data);
        setNotification({
          type: 'success',
          text: `Perfil de usuario sincronizado exitosamente desde PostgreSQL (GET /auth/me). ${res.durationMs}ms`,
          code: res.statusCode,
        });
      } else {
        setNotification({
          type: 'error',
          text: res.error || 'Error al consultar perfil del backend.',
          code: res.statusCode,
        });
      }
    } finally {
      setIsExecuting(false);
    }
  }, [recordResponse]);

  // ─── 2. ACCIÓN: POST /auth/refresh (Renovar Sesión Criptográfica) ───────────
  const handleRefreshToken = useCallback(async () => {
    setIsExecuting(true);
    setNotification(null);
    try {
      const res = await requestInspect<{
        accessToken: string;
        tokenType: string;
        expiresIn: number;
        user: AuthUser;
      }>('/auth/refresh', { method: 'POST' });
      recordResponse(res);

      if (res.statusCode === 200 && res.data) {
        if (res.data.accessToken) {
          setToken(res.data.accessToken);
        }
        if (res.data.user) {
          setUserProfile(res.data.user);
        }
        setNotification({
          type: 'success',
          text: `Sesión renovada y token rotado correctamente (POST /auth/refresh). Válido por ${res.data.expiresIn}s.`,
          code: res.statusCode,
        });
      } else {
        setNotification({
          type: 'error',
          text: res.error || 'No se pudo renovar la sesión.',
          code: res.statusCode,
        });
      }
    } finally {
      setIsExecuting(false);
    }
  }, [recordResponse]);

  // ─── 3. ACCIÓN: POST /auth/logout (Cerrar Sesión Segura) ───────────────────
  const handleLogoutAction = useCallback(async () => {
    setIsExecuting(true);
    setNotification(null);
    try {
      const res = await requestInspect('/auth/logout', { method: 'POST' });
      recordResponse(res);
      removeToken();
      setShowLogoutModal(false);
      setNotification({
        type: 'success',
        text: `Sesión cerrada exitosamente en el servidor (POST /auth/logout - HTTP ${res.statusCode}). Redirigiendo...`,
        code: res.statusCode,
      });
      setTimeout(() => {
        window.location.href = '/login';
      }, 1200);
    } finally {
      setIsExecuting(false);
    }
  }, [recordResponse]);

  // ─── 4. PRUEBAS DE SEGURIDAD RBAC (GET, POST, PATCH, DELETE /users) ─────────
  const handleTestRbacEndpoint = useCallback(
    async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', endpoint: string, body?: unknown) => {
      setIsExecuting(true);
      setNotification(null);
      try {
        const res = await requestInspect(endpoint, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        });
        recordResponse(res);

        if (res.statusCode === 403) {
          setNotification({
            type: 'info',
            text: `Enforzamiento de Seguridad RBAC Verificado (HTTP 403 Forbidden). El servidor protegió el recurso administrativo '${endpoint}'.`,
            code: res.statusCode,
          });
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          setNotification({
            type: 'error',
            text: `Inesperado: El endpoint administrativo respondió HTTP ${res.statusCode}. Verifica los permisos en backend.`,
            code: res.statusCode,
          });
        } else {
          setNotification({
            type: 'error',
            text: res.error || `Error HTTP ${res.statusCode} al llamar ${endpoint}`,
            code: res.statusCode,
          });
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [recordResponse]
  );

  // ─── 5. LLAMADAS REALES A ENDPOINTS NO IMPLEMENTADOS (404 Not Found) ────────
  const handleTestPendingEndpoint = useCallback(
    async (moduleCheck: BusinessModuleCheck) => {
      setIsExecuting(true);
      setNotification(null);
      try {
        const res = await requestInspect(moduleCheck.endpointPrevisto, {
          method: moduleCheck.metodo,
          body: moduleCheck.sampleBody ? JSON.stringify(moduleCheck.sampleBody) : undefined,
        });
        recordResponse(res);

        if (res.statusCode === 404) {
          setNotification({
            type: 'info',
            text: `Endpoint no implementado en backend (HTTP 404 Not Found devuelto por NestJS: "${res.error || res.statusText}"). No se simula información según directriz técnica.`,
            code: res.statusCode,
          });
        } else {
          setNotification({
            type: 'info',
            text: `Respuesta del servidor para ${moduleCheck.metodo} ${moduleCheck.endpointPrevisto}: HTTP ${res.statusCode}.`,
            code: res.statusCode,
          });
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [recordResponse]
  );

  // ─── 6. LLAMADA REAL A PATCH /auth/me (Actualizar datos propios) ───────────
  const handleSubmitUpdateProfile = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsExecuting(true);
      setNotification(null);
      try {
        const res = await requestInspect('/auth/me', {
          method: 'PATCH',
          body: JSON.stringify(profileFormData),
        });
        recordResponse(res);
        setShowUpdateProfileModal(false);

        if (res.statusCode === 200) {
          setNotification({
            type: 'success',
            text: 'Datos de perfil actualizados exitosamente en la base de datos (HTTP 200).',
            code: res.statusCode,
          });
          handleReloadProfile();
        } else if (res.statusCode === 404) {
          setNotification({
            type: 'info',
            text: `Función PATCH /auth/me no existe en backend actualmente (HTTP 404 Not Found: "${res.error}"). No se simula información.`,
            code: res.statusCode,
          });
        } else {
          setNotification({
            type: 'error',
            text: res.error || `Error al actualizar perfil (HTTP ${res.statusCode})`,
            code: res.statusCode,
          });
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [profileFormData, recordResponse, handleReloadProfile]
  );

  // ─── 7. LLAMADA REAL A POST /auth/change-password ──────────────────────────
  const handleSubmitChangePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsExecuting(true);
      setNotification(null);
      try {
        const res = await requestInspect('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify(passwordFormData),
        });
        recordResponse(res);
        setShowChangePasswordModal(false);

        if (res.statusCode === 200) {
          setNotification({
            type: 'success',
            text: 'Contraseña cambiada exitosamente (HTTP 200).',
            code: res.statusCode,
          });
        } else if (res.statusCode === 404) {
          setNotification({
            type: 'info',
            text: `Función POST /auth/change-password no existe en backend actualmente (HTTP 404 Not Found: "${res.error}"). No se simula información.`,
            code: res.statusCode,
          });
        } else {
          setNotification({
            type: 'error',
            text: res.error || `Error al cambiar contraseña (HTTP ${res.statusCode})`,
            code: res.statusCode,
          });
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [passwordFormData, recordResponse]
  );

  // ─── Cálculos y Filtros ───────────────────────────────────────────────────
  const permissionsList = useMemo(() => userProfile.permisos || [], [userProfile.permisos]);
  const roleName = useMemo(() => {
    if (typeof userProfile.rol === 'string') return userProfile.rol;
    return userProfile.rol?.nombre || 'USUARIO';
  }, [userProfile.rol]);

  const filteredPermissions = useMemo(() => {
    if (!searchPermission.trim()) return permissionsList;
    const term = searchPermission.toLowerCase().trim();
    return permissionsList.filter((code) => {
      const details = PERMISSION_DETAILS[code];
      return (
        code.toLowerCase().includes(term) ||
        (details?.titulo && details.titulo.toLowerCase().includes(term)) ||
        (details?.modulo && details.modulo.toLowerCase().includes(term))
      );
    });
  }, [permissionsList, searchPermission]);

  return (
    <>
      {/* ─── BANNER PRINCIPAL DEL DASHBOARD ───────────────────────────────── */}
      <div className={styles.headerBanner}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <span className={`${styles.roleTag} ${styles.roleTagUser}`}>
              💼 Rol Operativo ({roleName})
            </span>
            <span className={`${styles.statusBadge} ${styles.statusActive}`}>
              Servidor NestJS Conectado
            </span>
          </div>
          <h1 className={styles.headerBannerTitle}>
            Portal de Trabajo Operativo
          </h1>
          <p className={styles.headerBannerDesc}>
            Espacio de operaciones del CRM Contable. Ejecuta las funciones disponibles del rol Usuario, valida el control de acceso (RBAC) y audita las respuestas HTTP reales del backend sin simulación.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            id="btn-sync-profile"
            type="button"
            className={styles.btnSecondary}
            onClick={handleReloadProfile}
            disabled={isExecuting}
            title="Llama a GET /api/v1/auth/me y actualiza los datos"
          >
            {isExecuting ? <span className={styles.spinner} /> : '↻'} Sincronizar Perfil (GET)
          </button>
          <button
            id="btn-refresh-token"
            type="button"
            className={styles.btnPrimary}
            onClick={handleRefreshToken}
            disabled={isExecuting}
            title="Llama a POST /api/v1/auth/refresh con rotación de token"
          >
            {isExecuting ? <span className={styles.spinner} /> : '⚡'} Renovar Sesión (POST)
          </button>
          <button
            id="btn-trigger-logout"
            type="button"
            className={styles.btnLogout}
            onClick={() => setShowLogoutModal(true)}
            disabled={isExecuting}
            title="Abre modal para ejecutar POST /api/v1/auth/logout"
          >
            🚪 Cerrar Sesión
          </button>
        </div>
      </div>

      {/* ─── ALERTAS Y MENSAJES DE ESTADO ──────────────────────────────────── */}
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
          <span>
            {notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️'}
          </span>
          <div style={{ flex: 1 }}>
            {notification.code && (
              <span
                style={{
                  fontWeight: 700,
                  marginRight: '0.5rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.1)',
                }}
              >
                HTTP {notification.code}
              </span>
            )}
            <span>{notification.text}</span>
          </div>
          <button
            type="button"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
            onClick={() => setNotification(null)}
            aria-label="Cerrar alerta"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── KPIS DE ESTADO OPERATIVO ──────────────────────────────────────── */}
      <section className={styles.kpiGrid} aria-label="Métricas de sesión operativa">
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiGreen}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{roleName}</div>
            <div className={styles.kpiLabel}>Rol Asignado en BD</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiIndigo}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{permissionsList.length}</div>
            <div className={styles.kpiLabel}>Permisos Efectivos Activos</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiPurple}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>
              {latestResponse ? `HTTP ${latestResponse.statusCode}` : '200 OK'}
            </div>
            <div className={styles.kpiLabel}>Último Estado de Red</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiRed}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>Enforzado</div>
            <div className={styles.kpiLabel}>Control RBAC Backend</div>
          </div>
        </div>
      </section>

      {/* ─── TARJETA DE PERFIL Y ACCIONES DE IDENTIDAD ──────────────────────── */}
      <section className={styles.userProfileCard}>
        <div className={styles.userBigAvatar}>
          {userProfile.nombres?.[0]?.toUpperCase() || 'U'}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {userProfile.nombres} {userProfile.apellidos}
            </h2>
            <span className={`${styles.statusBadge} ${styles.statusActive}`}>
              Sesión Activa
            </span>
          </div>

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {userProfile.email}
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>
                UUID EN POSTGRESQL
              </span>
              <code style={{ fontSize: '0.8rem', color: '#a5b4fc', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: 4 }}>
                {userProfile.id}
              </code>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>
                AUTENTICACIÓN
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#34d399' }}>JWT Bearer + HttpOnly Cookie</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>
                ALCANCE DE ROL
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#6ee7b7' }}>Operativo (Sin acceso administrativo)</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowRawProfileModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            📋 Ver Payload Perfil (JSON)
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowUpdateProfileModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            ✏️ Actualizar Perfil (PATCH /auth/me)
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowChangePasswordModal(true)}
            style={{ fontSize: '0.8rem' }}
          >
            🔑 Cambiar Contraseña (POST)
          </button>
        </div>
      </section>

      {/* ─── VISOR EN TIEMPO REAL DE RESPUESTAS HTTP (INSPECTOR) ────────────── */}
      <section className={styles.inspectorCard}>
        <div className={styles.inspectorHeader}>
          <div className={styles.inspectorTitle}>
            <span style={{ fontSize: '1.1rem' }}>📡</span>
            <span>Inspector Universal de Respuestas HTTP en Vivo</span>
          </div>

          {latestResponse && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span
                className={`${styles.methodBadge} ${
                  latestResponse.method === 'GET'
                    ? styles.methodGet
                    : latestResponse.method === 'POST'
                    ? styles.methodPost
                    : latestResponse.method === 'PATCH'
                    ? styles.methodPatch
                    : styles.methodDelete
                }`}
              >
                {latestResponse.method}
              </span>

              <code style={{ fontSize: '0.8rem', color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: 4 }}>
                {latestResponse.endpoint}
              </code>

              <span
                className={`${styles.statusHttpBadge} ${
                  latestResponse.statusCode >= 200 && latestResponse.statusCode < 300
                    ? styles.status2xx
                    : latestResponse.statusCode === 403
                    ? styles.status403
                    : latestResponse.statusCode === 404
                    ? styles.status404
                    : styles.statusError
                }`}
              >
                HTTP {latestResponse.statusCode} {latestResponse.statusText}
              </span>

              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                ⏱️ {latestResponse.durationMs}ms | 🕒 {latestResponse.timestamp}
              </span>
            </div>
          )}
        </div>

        <div style={{ padding: '1rem 1.25rem' }}>
          {latestResponse ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Datos Devueltos por el Backend (JSON Payload):
                </span>
                {latestResponse.error && (
                  <span style={{ fontSize: '0.78rem', color: '#fb7185', fontWeight: 600 }}>
                    Mensaje de Error / Denegación: {latestResponse.error}
                  </span>
                )}
              </div>
              <pre className={styles.codeBlock}>
                {JSON.stringify(latestResponse.data || { error: latestResponse.error }, null, 2)}
              </pre>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              ℹ️ Aún no has ejecutado peticiones en esta vista. Haz clic en cualquiera de las acciones, formularios o pruebas RBAC para inspeccionar el intercambio HTTP en vivo.
            </div>
          )}
        </div>
      </section>

      {/* ─── NAVEGACIÓN POR PESTAÑAS DEL DASHBOARD ─────────────────────────── */}
      <div className={styles.tabNav}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'capacidades' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('capacidades')}
        >
          📋 Capacidades Concedidas ({permissionsList.length})
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'seguridad' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('seguridad')}
        >
          🛡️ Auditoría de Seguridad y Bloqueos RBAC
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'modulos' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('modulos')}
        >
          📦 Módulos Operativos (Sin Simulación)
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'historial' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          📜 Historial de Solicitudes ({httpHistory.length})
        </button>
      </div>

      {/* ─── PESTAÑA 1: CAPACIDADES OPERATIVAS CONCEDIDAS ─────────────────── */}
      {activeTab === 'capacidades' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Capacidades Operativas Concedidas por Rol</h2>
                <p className={styles.cardSubtitle}>
                  Permisos granulares asignados en PostgreSQL consultados mediante GET /api/v1/auth/me
                </p>
              </div>
            </div>

            <div className={styles.searchInputWrapper} style={{ maxWidth: 300 }}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar capacidad o módulo..."
                value={searchPermission}
                onChange={(e) => setSearchPermission(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.cardBody} style={{ padding: 0 }}>
            <div className={styles.tableResponsive}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Módulo del Negocio</th>
                    <th>Código de Permiso</th>
                    <th>Nombre y Alcance</th>
                    <th>Estado en Base de Datos</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPermissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        No se encontraron permisos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredPermissions.map((code) => {
                      const details = PERMISSION_DETAILS[code] || {
                        modulo: 'Operación General',
                        titulo: code,
                        descripcion: 'Permiso granular registrado en el catálogo maestro del sistema.',
                        operaciones: ['Acción operativa autorizada'],
                      };

                      return (
                        <tr key={code}>
                          <td>
                            <strong style={{ color: '#f1f5f9' }}>{details.modulo}</strong>
                          </td>
                          <td>
                            <code className={styles.permissionTag}>{code}</code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem' }}>
                              {details.titulo}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                              {details.descripcion}
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                              ✓ Concedido
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                              onClick={() =>
                                setSelectedPermission({
                                  codigo: code,
                                  ...details,
                                })
                              }
                            >
                              🔍 Ver Detalle
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ─── PESTAÑA 2: AUDITORÍA DE SEGURIDAD Y BLOQUEOS RBAC ────────────── */}
      {activeTab === 'seguridad' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Consola de Auditoría y Verificación de Seguridad RBAC</h2>
                <p className={styles.cardSubtitle}>
                  Comprueba que el backend NestJS rechaza las acciones de Administrador con código HTTP 403 Forbidden
                </p>
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Por directriz de seguridad de la arquitectura CRM Contable, el rol <strong>Usuario</strong> no posee el permiso <code>usuarios.gestionar</code>. La interfaz te permite ejecutar peticiones HTTP directas hacia las rutas protegidas para comprobar en vivo que los <code>Guards</code> del backend interceptan la solicitud y devuelven <code>403 Forbidden</code>, resguardando la base de datos contra accesos no autorizados.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {/* Test 1: GET /users */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodGet}`}>GET</span>
                  <code style={{ fontSize: '0.8rem', color: '#a5b4fc' }}>/api/v1/users</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Consultar Catálogo de Usuarios
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Intenta listar todos los usuarios del sistema sin tener el permiso administrativo <code>usuarios.gestionar</code>.
                </p>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleTestRbacEndpoint('GET', '/users')}
                  disabled={isExecuting}
                >
                  {isExecuting ? <span className={styles.spinner} /> : '🔍'} Ejecutar GET /users (Esperando 403)
                </button>
              </div>

              {/* Test 2: GET /users/roles */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodGet}`}>GET</span>
                  <code style={{ fontSize: '0.8rem', color: '#a5b4fc' }}>/api/v1/users/roles</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Consultar Catálogo de Roles
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Intenta obtener la lista completa de roles y asignación de permisos administrativos.
                </p>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleTestRbacEndpoint('GET', '/users/roles')}
                  disabled={isExecuting}
                >
                  {isExecuting ? <span className={styles.spinner} /> : '🔍'} Ejecutar GET /users/roles (Esperando 403)
                </button>
              </div>

              {/* Test 3: GET /users/:id */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodGet}`}>GET</span>
                  <code style={{ fontSize: '0.8rem', color: '#a5b4fc' }}>/api/v1/users/:id</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Consultar Usuario Específico por UUID
                </h3>
                <div style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    value={rbacUserIdInput}
                    onChange={(e) => setRbacUserIdInput(e.target.value)}
                    placeholder="UUID de usuario..."
                  />
                </div>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleTestRbacEndpoint('GET', `/users/${rbacUserIdInput}`)}
                  disabled={isExecuting}
                >
                  {isExecuting ? <span className={styles.spinner} /> : '🔍'} Consultar Detalle (Esperando 403)
                </button>
              </div>

              {/* Test 4: POST /users (Modal Formulario) */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodPost}`}>POST</span>
                  <code style={{ fontSize: '0.8rem', color: '#34d399' }}>/api/v1/users</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Crear Nuevo Usuario (Formulario)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Abre un formulario modal para enviar un payload POST e intentar dar de alta un usuario en base de datos.
                </p>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowRbacCreateModal(true)}
                  disabled={isExecuting}
                >
                  ➕ Abrir Formulario POST /users
                </button>
              </div>

              {/* Test 5: PATCH /users/:id (Modal Formulario) */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodPatch}`}>PATCH</span>
                  <code style={{ fontSize: '0.8rem', color: '#fbbf24' }}>/api/v1/users/:id</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Modificar Usuario (Formulario)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Abre un formulario modal para intentar alterar el rol o datos de otro usuario.
                </p>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowRbacEditModal(true)}
                  disabled={isExecuting}
                >
                  ✏️ Abrir Formulario PATCH /users
                </button>
              </div>

              {/* Test 6: DELETE /users/:id */}
              <div className={styles.moduleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={`${styles.methodBadge} ${styles.methodDelete}`}>DELETE</span>
                  <code style={{ fontSize: '0.8rem', color: '#fb7185' }}>/api/v1/users/:id</code>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', margin: '0.2rem 0' }}>
                  Desactivar / Eliminar Usuario
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Intenta ejecutar un soft-delete de una cuenta del sistema mediante una petición DELETE.
                </p>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleTestRbacEndpoint('DELETE', `/users/${rbacUserIdInput}`)}
                  disabled={isExecuting}
                >
                  {isExecuting ? <span className={styles.spinner} /> : '🗑️'} Ejecutar DELETE (Esperando 403)
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── PESTAÑA 3: MÓDULOS DE NEGOCIO Y ESTADO DE ENDPOINTS ──────────── */}
      {activeTab === 'modulos' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Módulos del Negocio y Disponibilidad de Endpoints</h2>
                <p className={styles.cardSubtitle}>
                  Verificación transparente de endpoints en NestJS: Si no existe en backend, se indica y NO se simula.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            <div className={`${styles.alert} ${styles.alertInfo}`} style={{ marginBottom: '1.5rem' }}>
              <span>ℹ️</span>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                <strong>Directriz de Integración:</strong> Los siguientes módulos corresponden a la lógica comercial de repuestos automotrices. Si el backend aún no expone el endpoint correspondiente, la interfaz lo indica con claridad y realiza la petición HTTP real, mostrando el error <code>404 Not Found</code> emitido por NestJS sin generar datos falsos ni simulaciones ficticias.
              </div>
            </div>

            <div className={styles.moduleGrid}>
              {BUSINESS_MODULES.map((mod) => (
                <div key={mod.id} className={styles.moduleCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{mod.icono}</span>
                      <strong style={{ fontSize: '0.95rem', color: '#f1f5f9' }}>{mod.modulo}</strong>
                    </div>

                    <span
                      className={`${styles.methodBadge} ${
                        mod.metodo === 'GET'
                          ? styles.methodGet
                          : mod.metodo === 'POST'
                          ? styles.methodPost
                          : styles.methodPatch
                      }`}
                    >
                      {mod.metodo}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                    {mod.descripcion}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: '0.75rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.45rem', borderRadius: 4 }}>
                      {mod.endpointPrevisto}
                    </code>
                    <span className={styles.featureNotImplementedBadge}>
                      ⚠️ Pendiente en Backend (No simulada)
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}
                    onClick={() => handleTestPendingEndpoint(mod)}
                    disabled={isExecuting}
                  >
                    {isExecuting ? <span className={styles.spinner} /> : '⚡'} Probar Endpoint HTTP Real
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── PESTAÑA 4: HISTORIAL DE PETICIONES HTTP ───────────────────────── */}
      {activeTab === 'historial' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Historial Cronológico de Peticiones HTTP</h2>
                <p className={styles.cardSubtitle}>
                  Registro de todas las operaciones ejecutadas durante tu sesión activa ({httpHistory.length} eventos)
                </p>
              </div>
            </div>

            {httpHistory.length > 0 && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setHttpHistory([])}
                style={{ fontSize: '0.8rem' }}
              >
                Limpiar Historial
              </button>
            )}
          </div>

          <div className={styles.cardBody} style={{ padding: 0 }}>
            {httpHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                No hay peticiones registradas aún. Interactúa con las funciones para registrar eventos.
              </div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Método</th>
                      <th>Endpoint Solicitado</th>
                      <th>Código HTTP</th>
                      <th>Latencia</th>
                      <th>Diagnóstico</th>
                      <th style={{ textAlign: 'right' }}>Inspeccionar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {httpHistory.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {item.timestamp}
                        </td>
                        <td>
                          <span
                            className={`${styles.methodBadge} ${
                              item.method === 'GET'
                                ? styles.methodGet
                                : item.method === 'POST'
                                ? styles.methodPost
                                : item.method === 'PATCH'
                                ? styles.methodPatch
                                : styles.methodDelete
                            }`}
                          >
                            {item.method}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{item.endpoint}</code>
                        </td>
                        <td>
                          <span
                            className={`${styles.statusHttpBadge} ${
                              item.statusCode >= 200 && item.statusCode < 300
                                ? styles.status2xx
                                : item.statusCode === 403
                                ? styles.status403
                                : item.statusCode === 404
                                ? styles.status404
                                : styles.statusError
                            }`}
                          >
                            {item.statusCode} {item.statusText}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {item.durationMs} ms
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {item.statusCode === 200 || item.statusCode === 204 ? (
                            <span style={{ color: '#34d399' }}>Operación Autorizada</span>
                          ) : item.statusCode === 403 ? (
                            <span style={{ color: '#c084fc' }}>Bloqueo de Seguridad RBAC</span>
                          ) : item.statusCode === 404 ? (
                            <span style={{ color: '#facc15' }}>Endpoint No Implementado</span>
                          ) : (
                            <span style={{ color: '#fb7185' }}>Error del Servidor</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              setLatestResponse(item);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Ver en Visor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── MODAL 1: DETALLE DE PERMISO SELECCIONADO ───────────────────────── */}
      {selectedPermission && (
        <div className={styles.modalOverlay} onClick={() => setSelectedPermission(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🔑</span>
                <h3 className={styles.modalTitle}>{selectedPermission.titulo}</h3>
              </div>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setSelectedPermission(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  CÓDIGO FORMAL DEL PERMISO
                </span>
                <code className={styles.permissionTag} style={{ fontSize: '0.9rem', padding: '0.35rem 0.75rem' }}>
                  {selectedPermission.codigo}
                </code>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  MÓDULO DE LA ARQUITECTURA
                </span>
                <strong style={{ color: '#f1f5f9', fontSize: '0.95rem' }}>{selectedPermission.modulo}</strong>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  ALCANCE Y POLÍTICA
                </span>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  {selectedPermission.descripcion}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                  OPERACIONES PERMITIDAS EN LA INTERFAZ
                </span>
                <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                  {selectedPermission.operaciones.map((op, idx) => (
                    <li key={idx} style={{ marginBottom: '0.35rem' }}>
                      {op}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setSelectedPermission(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: VER PAYLOAD CRUDO DEL PERFIL (JSON) ──────────────────── */}
      {showRawProfileModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRawProfileModal(false)}>
          <div className={styles.modalContent} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Datos de Perfil Crudos (GET /auth/me)</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowRawProfileModal(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <pre className={styles.codeBlock} style={{ maxHeight: 380 }}>
                {JSON.stringify(userProfile, null, 2)}
              </pre>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setShowRawProfileModal(false)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: FORMULARIO POST /users (PRUEBA RBAC) ────────────────── */}
      {showRbacCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRbacCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Prueba RBAC: POST /api/v1/users</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowRbacCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowRbacCreateModal(false);
                handleTestRbacEndpoint('POST', '/users', rbacFormData);
              }}
            >
              <div className={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Envía un payload completo para crear un usuario. Como tu rol es <strong>Usuario</strong>, el backend debe rechazar la operación con <strong>403 Forbidden</strong>.
                </p>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Correo Electrónico</label>
                  <input
                    type="email"
                    className={styles.formInput}
                    value={rbacFormData.email}
                    onChange={(e) => setRbacFormData({ ...rbacFormData, email: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombres</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={rbacFormData.nombres}
                      onChange={(e) => setRbacFormData({ ...rbacFormData, nombres: e.target.value })}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Apellidos</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={rbacFormData.apellidos}
                      onChange={(e) => setRbacFormData({ ...rbacFormData, apellidos: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Contraseña de Acceso</label>
                  <input
                    type="password"
                    className={styles.formInput}
                    value={rbacFormData.password}
                    onChange={(e) => setRbacFormData({ ...rbacFormData, password: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowRbacCreateModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isExecuting}>
                  {isExecuting ? <span className={styles.spinner} /> : '📤'} Enviar POST /users
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: FORMULARIO PATCH /users/:id (PRUEBA RBAC) ────────────── */}
      {showRbacEditModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRbacEditModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Prueba RBAC: PATCH /api/v1/users/:id</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowRbacEditModal(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowRbacEditModal(false);
                handleTestRbacEndpoint('PATCH', `/users/${rbacUserIdInput}`, {
                  nombres: 'Nombre Alterado',
                  telefono: '3119998877',
                });
              }}
            >
              <div className={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Intenta modificar los datos de un usuario mediante PATCH. El backend debe interceptar y devolver <strong>403 Forbidden</strong>.
                </p>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>UUID del Usuario a Modificar</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={rbacUserIdInput}
                    onChange={(e) => setRbacUserIdInput(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nuevo Nombre Proyectado</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    defaultValue="Nombre Alterado"
                    readOnly
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowRbacEditModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isExecuting}>
                  {isExecuting ? <span className={styles.spinner} /> : '📤'} Enviar PATCH /users
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: ACTUALIZAR PERFIL PROPIO (PATCH /auth/me) ────────────── */}
      {showUpdateProfileModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUpdateProfileModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Actualizar Datos Propios (PATCH /auth/me)</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowUpdateProfileModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitUpdateProfile}>
              <div className={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Envía una solicitud HTTP PATCH a <code>/api/v1/auth/me</code> para actualizar tus datos de contacto personales.
                </p>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Nombres</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={profileFormData.nombres}
                      onChange={(e) => setProfileFormData({ ...profileFormData, nombres: e.target.value })}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Apellidos</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={profileFormData.apellidos}
                      onChange={(e) => setProfileFormData({ ...profileFormData, apellidos: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Teléfono de Contacto</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    value={profileFormData.telefono}
                    onChange={(e) => setProfileFormData({ ...profileFormData, telefono: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowUpdateProfileModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isExecuting}>
                  {isExecuting ? <span className={styles.spinner} /> : '💾'} Guardar Cambios (PATCH)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: CAMBIAR CONTRASEÑA (POST /auth/change-password) ──────── */}
      {showChangePasswordModal && (
        <div className={styles.modalOverlay} onClick={() => setShowChangePasswordModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Cambio de Contraseña (POST)</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowChangePasswordModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitChangePassword}>
              <div className={styles.modalBody}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Envía una solicitud HTTP POST a <code>/api/v1/auth/change-password</code> con tu clave actual y la nueva clave deseada.
                </p>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Contraseña Actual</label>
                  <input
                    type="password"
                    className={styles.formInput}
                    value={passwordFormData.currentPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nueva Contraseña</label>
                  <input
                    type="password"
                    className={styles.formInput}
                    value={passwordFormData.newPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowChangePasswordModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isExecuting}>
                  {isExecuting ? <span className={styles.spinner} /> : '🔒'} Actualizar Contraseña (POST)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 7: CONFIRMAR CIERRE DE SESIÓN (POST /auth/logout) ───────── */}
      {showLogoutModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLogoutModal(false)}>
          <div className={styles.modalContent} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Confirmar Cierre de Sesión</h3>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setShowLogoutModal(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                ¿Estás seguro de que deseas salir? Esta acción llamará al endpoint HTTP{' '}
                <code>POST /api/v1/auth/logout</code>, invalidando el refresh token en PostgreSQL y revocando la cookie de sesión.
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowLogoutModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnLogout}
                onClick={handleLogoutAction}
                disabled={isExecuting}
              >
                {isExecuting ? <span className={styles.spinner} /> : '🚪'} Confirmar Cierre (POST)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
