'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from '../dashboard.module.css';
import { UserItem, RoleItem, fetchUsers, fetchRoles, deleteUser } from '@/lib/api';
import UserModal from './UserModal';
import UserDetailModal from './UserDetailModal';

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Active view tab: 'users' | 'roles'
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

  // Load roles once on mount
  useEffect(() => {
    fetchRoles()
      .then((data) => setRoles(data))
      .catch((err) => {
        console.error('Error fetching roles:', err);
      });
  }, []);

  // Fetch users with current filters
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchUsers(searchTerm, selectedRoleFilter);
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar los usuarios del sistema');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedRoleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.activo).length;
    const inactive = total - active;
    const rolesCount = roles.length;
    return { total, active, inactive, rolesCount };
  }, [users, roles]);

  // Handlers for modal actions
  function handleOpenCreate() {
    setEditingUser(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(user: UserItem) {
    setEditingUser(user);
    setIsModalOpen(true);
  }

  function handleOpenDetail(user: UserItem) {
    setViewingUserId(user.id);
  }

  function handleSuccess(msg: string) {
    setSuccessMessage(msg);
    loadUsers();
    setTimeout(() => setSuccessMessage(''), 5000);
  }

  // Deactivate / Delete handling
  async function confirmDelete() {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteUser(userToDelete.id);
      handleSuccess(res.message || `Usuario ${userToDelete.email} desactivado correctamente.`);
      setUserToDelete(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al desactivar el usuario');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {/* Banner de Bienvenida y Control de Rol */}
      <div className={styles.headerBanner}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <span className={`${styles.roleTag} ${styles.roleTagAdmin}`}>
              🛡️ Panel de Control Administrador
            </span>
          </div>
          <h1 className={styles.headerBannerTitle}>
            Gestión Central y Control de Acceso (RBAC)
          </h1>
          <p className={styles.headerBannerDesc}>
            Administración completa de usuarios del sistema, asignación de roles, activación de cuentas y catálogo de permisos.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.btnSecondary} ${activeTab === 'users' ? styles.btnPrimary : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 Usuarios ({users.length})
          </button>
          <button
            type="button"
            className={`${styles.btnSecondary} ${activeTab === 'roles' ? styles.btnPrimary : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            🔑 Roles y Permisos ({roles.length})
          </button>
          <button
            id="btn-create-user"
            type="button"
            className={styles.btnPrimary}
            onClick={handleOpenCreate}
          >
            + Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Alertas de Notificación */}
      {successMessage && (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          <span>✅ {successMessage}</span>
        </div>
      )}
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          <span>⚠️ {error}</span>
          <button
            type="button"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setError('')}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <section className={styles.kpiGrid} aria-label="Métricas del sistema">
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiIndigo}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{stats.total}</div>
            <div className={styles.kpiLabel}>Total Usuarios</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiGreen}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{stats.active}</div>
            <div className={styles.kpiLabel}>Usuarios Activos</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiRed}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{stats.inactive}</div>
            <div className={styles.kpiLabel}>Inactivos / Desactivados</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiPurple}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className={styles.kpiValue}>{stats.rolesCount}</div>
            <div className={styles.kpiLabel}>Roles RBAC</div>
          </div>
        </div>
      </section>

      {/* VISTA 1: Gestión de Usuarios */}
      {activeTab === 'users' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Directorio de Usuarios</h2>
                <p className={styles.cardSubtitle}>Listado en tiempo real desde el backend (GET /users)</p>
              </div>
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={loadUsers}
              disabled={loading}
              title="Recargar usuarios"
            >
              {loading ? <span className={styles.spinner} /> : '↻'} Recargar
            </button>
          </div>

          <div className={styles.cardBody}>
            {/* Barra de Filtros y Búsqueda */}
            <div className={styles.toolbar}>
              <div className={styles.filtersGroup}>
                <div className={styles.searchInputWrapper}>
                  <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    id="input-search-users"
                    type="text"
                    className={styles.searchInput}
                    placeholder="Buscar por nombre o correo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <select
                  id="select-role-filter"
                  className={styles.selectInput}
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  aria-label="Filtrar por rol"
                >
                  <option value="">Todos los Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({r.codigo})
                    </option>
                  ))}
                </select>

                {(searchTerm || selectedRoleFilter) && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedRoleFilter('');
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.8rem' }}
                  >
                    Limpiar Filtros
                  </button>
                )}
              </div>

              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Mostrando <strong>{users.length}</strong> registro{users.length === 1 ? '' : 's'}
              </div>
            </div>

            {/* Tabla de Usuarios */}
            <div className={styles.tableResponsive}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Teléfono</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Último Acceso</th>
                    <th>Fecha de Registro</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                        <span className={styles.spinner} style={{ width: 24, height: 24, marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--color-text-muted)' }}>Cargando usuarios desde el backend...</p>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                        No se encontraron usuarios coincidentes con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const rolCodigo = u.rol?.codigo || 'USUARIO';
                      const rolNombre = u.rol?.nombre || rolCodigo;
                      const isAdmin = rolCodigo === 'ADMIN';

                      return (
                        <tr key={u.id}>
                          <td>
                            <div className={styles.userCell}>
                              <div className={styles.userCellAvatar}>
                                {u.nombres?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div>
                                <div className={styles.userCellName}>
                                  {u.nombres} {u.apellidos}
                                </div>
                                <div className={styles.userCellEmail}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem' }}>
                              {u.telefono || '—'}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.roleTag} ${isAdmin ? styles.roleTagAdmin : styles.roleTagUser}`}>
                              {rolNombre}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.statusBadge} ${u.activo ? styles.statusActive : styles.statusInactive}`}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              {u.ultimoLogin
                                ? new Date(u.ultimoLogin).toLocaleDateString('es-CO', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Nunca'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              {u.creadoEn
                                ? new Date(u.creadoEn).toLocaleDateString('es-CO', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </span>
                          </td>
                          <td>
                            <div className={styles.actionsGroup} style={{ justifyContent: 'flex-end' }}>
                              {/* Ver detalle (GET /users/:id) */}
                              <button
                                type="button"
                                className={styles.btnAction}
                                title="Ver detalles y permisos"
                                onClick={() => handleOpenDetail(u)}
                                aria-label={`Ver detalles de ${u.nombres}`}
                              >
                                👁️
                              </button>

                              {/* Editar (PATCH /users/:id) */}
                              <button
                                type="button"
                                className={styles.btnAction}
                                title="Editar usuario"
                                onClick={() => handleOpenEdit(u)}
                                aria-label={`Editar ${u.nombres}`}
                              >
                                ✏️
                              </button>

                              {/* Desactivar / Eliminar (DELETE /users/:id) */}
                              {u.activo ? (
                                <button
                                  type="button"
                                  className={`${styles.btnAction} ${styles.btnActionDanger}`}
                                  title="Desactivar usuario (Soft delete)"
                                  onClick={() => setUserToDelete(u)}
                                  aria-label={`Desactivar a ${u.nombres}`}
                                >
                                  🗑️
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.btnAction}
                                  title="Reactivar usuario"
                                  onClick={() => handleOpenEdit(u)}
                                  style={{ color: '#34d399' }}
                                  aria-label={`Reactivar a ${u.nombres}`}
                                >
                                  🔄
                                </button>
                              )}
                            </div>
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

      {/* VISTA 2: Catálogo de Roles y Permisos (GET /users/roles) */}
      {activeTab === 'roles' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <div>
                <h2 className={styles.cardTitle}>Roles y Permisos del Sistema (RBAC)</h2>
                <p className={styles.cardSubtitle}>
                  Estructura de perfiles y capacidades granulares configuradas en base de datos
                </p>
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
              {roles.map((r) => {
                const isAdmin = r.codigo === 'ADMIN';

                return (
                  <div
                    key={r.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <h3 style={{ fontSize: '1.15rem', color: '#f8fafc', fontWeight: 700 }}>
                            {r.nombre}
                          </h3>
                          <span className={`${styles.roleTag} ${isAdmin ? styles.roleTagAdmin : styles.roleTagUser}`}>
                            {r.codigo}
                          </span>
                        </div>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                          {r.descripcion || 'Sin descripción'}
                        </p>
                      </div>
                      <span className={`${styles.statusBadge} ${r.activo ? styles.statusActive : styles.statusInactive}`}>
                        {r.activo ? 'Vigente' : 'Inactivo'}
                      </span>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          PERMISOS ASIGNADOS
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: 700 }}>
                          {r.permisos?.length ?? 0} permisos
                        </span>
                      </div>

                      <div className={styles.permissionTagList}>
                        {r.permisos && r.permisos.length > 0 ? (
                          r.permisos.map((p) => (
                            <span key={p.id} className={styles.permissionTag} title={`${p.modulo}: ${p.nombre}`}>
                              {p.codigo}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            Sin permisos asignados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Modal de Creación / Edición (POST /users o PATCH /users/:id) */}
      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        roles={roles}
        userToEdit={editingUser}
      />

      {/* Modal de Detalle (GET /users/:id) */}
      <UserDetailModal
        userId={viewingUserId}
        onClose={() => setViewingUserId(null)}
      />

      {/* Modal de Confirmación para Desactivar / Eliminar (DELETE /users/:id) */}
      {userToDelete && (
        <div className={styles.modalOverlay} onClick={() => setUserToDelete(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Confirmar Desactivación</h2>
              <button
                type="button"
                className={styles.btnCloseModal}
                onClick={() => setUserToDelete(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1rem' }}>
                ¿Está seguro de que desea desactivar al usuario{' '}
                <strong style={{ color: '#fff' }}>
                  {userToDelete.nombres} {userToDelete.apellidos}
                </strong>{' '}
                (<code>{userToDelete.email}</code>)?
              </p>
              <div className={`${styles.alert} ${styles.alertInfo}`} style={{ fontSize: '0.8rem', marginBottom: 0 }}>
                ℹ️ Esta acción ejecuta una baja lógica (soft delete) en el backend, revocando el acceso inmediato sin eliminar el histórico contable.
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnLogout}
                style={{ padding: '0.6rem 1.15rem' }}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting && <span className={styles.spinner} />}
                {isDeleting ? 'Desactivando...' : 'Sí, Desactivar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
