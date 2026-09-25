'use client';

import React, { useState, useEffect } from 'react';
import styles from '../dashboard.module.css';
import { UserItem, fetchUserById } from '@/lib/api';

interface UserDetailModalProps {
  userId: string | null;
  onClose: () => void;
}

export default function UserDetailModal({ userId, onClose }: UserDetailModalProps) {
  const [user, setUser] = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) {
      setUser(null);
      return;
    }

    setLoading(true);
    setError('');

    fetchUserById(userId)
      .then((data) => setUser(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al obtener detalles del usuario');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Detalles del Usuario</h2>
          <button
            type="button"
            className={styles.btnCloseModal}
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <span className={styles.spinner} style={{ width: 28, height: 28 }} />
              <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Consultando información del usuario en el backend...
              </p>
            </div>
          )}

          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <span>⚠️ {error}</span>
            </div>
          )}

          {!loading && user && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className={styles.userBigAvatar} style={{ width: 56, height: 56, fontSize: '1.35rem' }}>
                  {user.nombres?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', fontWeight: 700 }}>
                    {user.nombres} {user.apellidos}
                  </h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    {user.email}
                  </p>
                </div>
              </div>

              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                display: 'grid',
                gap: '0.85rem',
              }}>
                <DetailRow label="ID de Usuario (UUID)" value={user.id} isCode />
                <DetailRow label="Teléfono" value={user.telefono || 'No registrado'} />
                <DetailRow
                  label="Estado de Acceso"
                  value={user.activo ? 'Activo (Acceso permitido)' : 'Inactivo (Acceso suspendido)'}
                  badge={user.activo ? styles.statusActive : styles.statusInactive}
                />
                <DetailRow
                  label="Rol Asignado"
                  value={user.rol?.nombre ? `${user.rol.nombre} (${user.rol.codigo})` : 'Sin rol'}
                />
                <DetailRow
                  label="Fecha de Registro"
                  value={user.creadoEn ? new Date(user.creadoEn).toLocaleString('es-CO') : '—'}
                />
                <DetailRow
                  label="Último Inicio de Sesión"
                  value={user.ultimoLogin ? new Date(user.ultimoLogin).toLocaleString('es-CO') : 'Sin registro de login'}
                />
              </div>

              {/* Granular permissions associated */}
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.65rem' }}>
                  Permisos Efectivos ({user.rol?.permisos?.length ?? 0}):
                </h4>
                <div className={styles.permissionTagList}>
                  {user.rol?.permisos && user.rol.permisos.length > 0 ? (
                    user.rol.permisos.map((p) => (
                      <span key={p.id} className={styles.permissionTag} title={p.descripcion || p.nombre}>
                        {p.codigo}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Sin permisos específicos asignados a este rol.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  isCode,
  badge,
}: {
  label: string;
  value: string;
  isCode?: boolean;
  badge?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{label}</span>
      {badge ? (
        <span className={`${styles.statusBadge} ${badge}`}>{value}</span>
      ) : isCode ? (
        <code style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.45rem', borderRadius: 4, color: '#a5b4fc' }}>
          {value}
        </code>
      ) : (
        <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  );
}
