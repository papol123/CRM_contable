'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './login.module.css';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function LogoIcon() {
  return (
    <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
      <path d="M6.5 6.5h.01M17.5 6.5h.01M17.5 17.5h.01M6.5 17.5h.01" strokeWidth="2.5" />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEmail(email: string): string {
  if (!email) return 'El correo electrónico es requerido';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'El correo no tiene un formato válido';
  return '';
}

function validatePassword(password: string): string {
  if (!password) return 'La contraseña es requerida';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
  return '';
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const e = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(e);
    return !e.email && !e.password;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
      router.replace('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión. Inténtalo de nuevo.';
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* Animated background */}
      <div className={styles.background} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orb1}`} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orb2}`} aria-hidden="true" />

      {/* Glass card */}
      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.logoWrapper}>
            <LogoIcon />
          </div>
          <h1 className={styles.title}>CRM Contable</h1>
          <p className={styles.subtitle}>Ingresa tus credenciales para continuar</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* API Error */}
          {apiError && (
            <div className={styles.alertError} role="alert">
              <AlertIcon />
              <span>{apiError}</span>
            </div>
          )}

          {/* Email */}
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Correo electrónico</label>
            <div className={styles.inputWrapper}>
              <input
                id="email"
                type="email"
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                placeholder="admin@crmcontable.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: '' })); }}
                onBlur={() => setErrors((p) => ({ ...p, email: validateEmail(email) }))}
                autoComplete="email"
                disabled={isLoading}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              <EmailIcon className={styles.inputIcon} />
            </div>
            {errors.email && (
              <span id="email-error" className={styles.fieldError} role="alert">
                {errors.email}
              </span>
            )}
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Contraseña</label>
            <div className={styles.inputWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: '' })); }}
                onBlur={() => setErrors((p) => ({ ...p, password: validatePassword(password) }))}
                autoComplete="current-password"
                disabled={isLoading}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              <LockIcon className={styles.inputIcon} />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && (
              <span id="password-error" className={styles.fieldError} role="alert">
                {errors.password}
              </span>
            )}
          </div>

          {/* Submit */}
          <button
            id="btn-login"
            type="submit"
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading && <span className={styles.spinner} aria-hidden="true" />}
            {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <footer className={styles.footer}>
          © {new Date().getFullYear()} CRM Contable — Todos los derechos reservados
        </footer>
      </div>
    </main>
  );
}
