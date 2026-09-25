'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import styles from '../dashboard.module.css';
import { RoleItem, UserItem, CreateUserInput, UpdateUserInput, createUser, updateUser } from '@/lib/api';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  roles: RoleItem[];
  userToEdit: UserItem | null;
}

export default function UserModal({
  isOpen,
  onClose,
  onSuccess,
  roles,
  userToEdit,
}: UserModalProps) {
  const isEditing = !!userToEdit;

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [idRol, setIdRol] = useState('');
  const [activo, setActivo] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (userToEdit) {
      setNombres(userToEdit.nombres || '');
      setApellidos(userToEdit.apellidos || '');
      setEmail(userToEdit.email || '');
      setPassword('');
      setTelefono(userToEdit.telefono || '');
      setIdRol(userToEdit.idRol || userToEdit.rol?.id || (roles[0]?.id ?? ''));
      setActivo(userToEdit.activo);
    } else {
      setNombres('');
      setApellidos('');
      setEmail('');
      setPassword('');
      setTelefono('');
      setIdRol(roles[0]?.id || '');
      setActivo(true);
    }
    setErrors({});
    setApiError('');
  }, [userToEdit, roles, isOpen]);

  if (!isOpen) return null;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!nombres.trim()) errs.nombres = 'El nombre es obligatorio';
    if (!apellidos.trim()) errs.apellidos = 'Los apellidos son obligatorios';
    if (!email.trim()) {
      errs.email = 'El correo electrónico es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Formato de correo inválido';
    }

    if (!isEditing) {
      if (!password) {
        errs.password = 'La contraseña es obligatoria';
      } else if (password.length < 6) {
        errs.password = 'La contraseña debe tener al menos 6 caracteres';
      }
    } else if (password && password.length < 6) {
      errs.password = 'La nueva contraseña debe tener al menos 6 caracteres';
    }

    if (!idRol) errs.idRol = 'Debe seleccionar un rol para el usuario';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isEditing && userToEdit) {
        const payload: UpdateUserInput = {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          email: email.trim(),
          idRol,
          activo,
        };
        if (telefono.trim()) payload.telefono = telefono.trim();
        if (password.trim()) payload.password = password.trim();

        await updateUser(userToEdit.id, payload);
        onSuccess(`Usuario "${nombres} ${apellidos}" actualizado exitosamente.`);
      } else {
        const payload: CreateUserInput = {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          email: email.trim(),
          password: password.trim(),
          idRol,
          activo,
        };
        if (telefono.trim()) payload.telefono = telefono.trim();

        await createUser(payload);
        onSuccess(`Usuario "${nombres} ${apellidos}" creado exitosamente.`);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la solicitud.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {isEditing ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
          </h2>
          <button
            type="button"
            className={styles.btnCloseModal}
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {apiError && (
              <div className={`${styles.alert} ${styles.alertError}`} role="alert">
                <span>⚠️ {apiError}</span>
              </div>
            )}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nombres *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Ej. Juan"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.nombres && <span className={styles.formError}>{errors.nombres}</span>}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Apellidos *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Ej. Pérez Gómez"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.apellidos && <span className={styles.formError}>{errors.apellidos}</span>}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Correo Electrónico *</label>
              <input
                type="email"
                className={styles.formInput}
                placeholder="ejemplo@crmcontable.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              {errors.email && <span className={styles.formError}>{errors.email}</span>}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {isEditing ? 'Nueva Contraseña (Opcional)' : 'Contraseña *'}
                </label>
                <input
                  type="password"
                  className={styles.formInput}
                  placeholder={isEditing ? 'Dejar en blanco para no modificar' : 'Mínimo 6 caracteres'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.password && <span className={styles.formError}>{errors.password}</span>}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Teléfono</label>
                <input
                  type="tel"
                  className={styles.formInput}
                  placeholder="+57 300 123 4567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Rol Asignado *</label>
              <select
                className={styles.selectInput}
                style={{ width: '100%' }}
                value={idRol}
                onChange={(e) => setIdRol(e.target.value)}
                disabled={isSubmitting}
              >
                {roles.length === 0 && <option value="">Cargando roles...</option>}
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} ({r.codigo}) — {r.permisos?.length ?? 0} permisos
                  </option>
                ))}
              </select>
              {errors.idRol && <span className={styles.formError}>{errors.idRol}</span>}
            </div>

            <div className={styles.formGroup} style={{ marginTop: '0.75rem' }}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkboxInput}
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Usuario activo (permite acceso al sistema)</span>
              </label>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={isSubmitting}
            >
              {isSubmitting && <span className={styles.spinner} />}
              {isSubmitting
                ? isEditing ? 'Guardando cambios...' : 'Creando usuario...'
                : isEditing ? 'Actualizar Usuario' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
