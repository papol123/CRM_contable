'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, Mail, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { setSession } from '@/lib/auth';
import { cleanIdentification } from '@/lib/format';

// Directorio de usuarios y documentos según la base de datos (backend/scripts/data/base.js)
const USUARIOS_ENLACE = [
  { documento: '1014234567', email: 'admin@crmcontable.com', rol: 'Administrador (Admin)', nombre: 'Carlos Andrés Pérez' },
  { documento: '1020567890', email: 'gerencia@crmcontable.com', rol: 'Gerente General', nombre: 'María Fernanda Morales' },
  { documento: '1035678901', email: 'usuario@crmcontable.com', rol: 'Asesor de Mostrador (Usuario)', nombre: 'Juan Camilo Gómez' },
  { documento: '1047890123', email: 'vendedor@crmcontable.com', rol: 'Asesora Comercial', nombre: 'Laura Daniela Ortiz' },
  { documento: '1052345678', email: 'operador@crmcontable.com', rol: 'Encargado de Bodega', nombre: 'Andrés Felipe Rojas' },
  { documento: '1063456789', email: 'caja@crmcontable.com', rol: 'Cajera Facturadora', nombre: 'Sandra Milena Vargas' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/dashboard';
  const isExpired = searchParams.get('expired') === '1';

  const [identification, setIdentification] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberId, setRememberId] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorProblem, setErrorProblem] = useState<ProblemDetails | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; identification?: string }>({});
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);

  // Cargar credenciales guardadas si existen
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem('crm_remembered_id');
      const savedEmail = localStorage.getItem('crm_remembered_email');
      if (savedId) {
        setIdentification(savedId);
        setRememberId(true);
      }
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  // Temporizador para 429
  useEffect(() => {
    if (rateLimitSeconds === null || rateLimitSeconds <= 0) return;
    const timer = setInterval(() => {
      setRateLimitSeconds((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  // Enlace inteligente bidireccional:
  // Al ingresar Documento -> auto-enlaza Correo
  const handleIdentificationChange = (val: string) => {
    const cleaned = cleanIdentification(val);
    setIdentification(cleaned);
    const match = USUARIOS_ENLACE.find((u) => u.documento === cleaned);
    if (match) {
      setEmail(match.email);
      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  // Al ingresar Correo -> auto-enlaza Documento
  const handleEmailChange = (val: string) => {
    setEmail(val);
    const match = USUARIOS_ENLACE.find((u) => u.email.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      setIdentification(match.documento);
    }
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
  };


  const validateClient = () => {
    const errs: { email?: string; password?: string; identification?: string } = {};

    // Si digitó identificación pero no correo, intentar resolverlo
    let effectiveEmail = email.trim();
    if (!effectiveEmail && identification.trim()) {
      const match = USUARIOS_ENLACE.find((u) => u.documento === identification.trim());
      if (match) {
        effectiveEmail = match.email;
        setEmail(match.email);
      }
    }

    if (!effectiveEmail) {
      errs.email = 'Ingresa tu número de identificación o correo electrónico';
    } else if (!/\S+@\S+\.\S+/.test(effectiveEmail)) {
      errs.email = 'Ingresa un correo electrónico corporativo válido';
    }

    if (!password) {
      errs.password = 'La contraseña es requerida';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorProblem(null);

    if (!validateClient()) return;

    // Resolver correo si solo se digitó documento
    let targetEmail = email.trim();
    if (!targetEmail && identification.trim()) {
      const match = USUARIOS_ENLACE.find((u) => u.documento === identification.trim());
      if (match) targetEmail = match.email;
    }

    setIsLoading(true);

    try {
      if (typeof window !== 'undefined') {
        if (rememberId) {
          localStorage.setItem('crm_remembered_id', identification);
          localStorage.setItem('crm_remembered_email', targetEmail);
        } else {
          localStorage.removeItem('crm_remembered_id');
          localStorage.removeItem('crm_remembered_email');
        }
      }

      const res = await api<{
        accessToken: string;
        user?: { permisos?: string[] };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, password }),
      });

      if (res.accessToken) {
        setSession(res.accessToken, { permisos: res.user?.permisos });
        router.push(nextUrl);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorProblem(err.problem);
        if (err.status === 401) {
          setPassword('');
        } else if (err.status === 429) {
          setRateLimitSeconds(60);
        }
      } else {
        setErrorProblem({
          type: 'about:blank',
          title: 'Error de conexión',
          detail: 'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.',
          instance: '/auth/login',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white py-8 px-6 sm:px-10 border border-[#e2e8f0] rounded-xl shadow-card space-y-6">
      {isExpired && !errorProblem && (
        <div className="p-3 bg-[#fffbeb] border border-[#fde68a] rounded-lg text-xs text-[#92400e] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#f59e0b] shrink-0" />
          <span>Tu sesión expiró tras 15 minutos de inactividad. Por favor ingresa de nuevo.</span>
        </div>
      )}

      {errorProblem && (
        <BannerError
          error={errorProblem}
          status={errorProblem.status}
          rceAction={
            errorProblem.status === 401
              ? {
                  label: 'Restablecer contraseña',
                  onClick: () =>
                    router.push(`/auth/forgot-password?email=${encodeURIComponent(email)}`),
                }
              : undefined
          }
          onDismiss={() => setErrorProblem(null)}
        />
      )}

      {rateLimitSeconds !== null && (
        <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-xs text-[#991b1b] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#ef4444] shrink-0" />
          <span>
            Demasiados intentos de acceso fallidos. Por seguridad, espera{' '}
            <strong>{rateLimitSeconds} segundos</strong> antes de intentar.
          </span>
        </div>
      )}


      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Identificación enlazada */}
        <Input
          label="Identificación (Cédula o NIT)"
          type="text"
          placeholder="Ej. 1014234567"
          value={identification}
          onChange={(e) => handleIdentificationChange(e.target.value)}
          helperText="Al digitar tu identificación se vinculará tu correo corporativo"
        />

        {/* Correo Electrónico */}
        <Input
          label="Correo electrónico corporativo"
          type="email"
          required
          placeholder="nombre@crmcontable.com"
          value={email}
          error={fieldErrors.email}
          onChange={(e) => handleEmailChange(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
        />

        {/* Contraseña */}
        <div className="space-y-1">
          <Input
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="••••••••"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#64748b] hover:text-[#0f172a] focus:outline-none p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-2 text-[#64748b] cursor-pointer">
            <input
              type="checkbox"
              checked={rememberId}
              onChange={(e) => setRememberId(e.target.checked)}
              className="w-4 h-4 rounded border-[#cbd5e1] text-[#1d63ed] focus:ring-[#1d63ed]"
            />
            <span>Recordar mis datos</span>
          </label>

          <Link
            href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="text-[#1d63ed] hover:underline font-medium"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            disabled={rateLimitSeconds !== null}
            className="w-full justify-center h-10 font-semibold"
          >
            {rateLimitSeconds ? `Espera ${rateLimitSeconds} s` : 'Ingresar'}
          </Button>
        </div>
      </form>

      <div className="pt-4 border-t border-[#e2e8f0] text-center text-xs text-[#64748b] flex items-center justify-center gap-1">
        <ShieldCheck className="w-4 h-4 text-[#10b981]" />
        <span>Conexión cifrada TLS 1.3 · Sesiones de 15 minutos</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-xl bg-[#1d63ed] items-center justify-center text-white font-bold text-xl shadow-md mb-4">
          AL
        </div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Apex Ledger</h1>
        <p className="mt-1 text-sm text-[#64748b]">Acceso seguro al CRM & ERP Contable</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense fallback={<div className="bg-white p-8 rounded-xl shadow-card h-80 animate-pulse" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
