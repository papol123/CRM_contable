'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { success } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [errorProblem, setErrorProblem] = useState<ProblemDetails | null>(null);

  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);
  const isSecure = hasMinLength && hasUpper && hasLower && hasNumber && hasSymbol;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setErrorProblem(null);

    if (!token) {
      setIsTokenExpired(true);
      setErrorProblem({
        type: 'about:blank',
        title: 'Token no proporcionado',
        detail: 'El enlace de recuperación no es válido o ha expirado.',
        instance: '/auth/reset-password',
      });
      return;
    }

    if (!isSecure) {
      setClientError('La contraseña no cumple con los requisitos mínimos de seguridad.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setClientError('Las contraseñas no coinciden. Conservamos la nueva contraseña para que la confirmes igual.');
      return;
    }

    setIsLoading(true);

    try {
      await api<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });

      success('Contraseña actualizada', 'Tu contraseña ha sido restablecida exitosamente. Inicia sesión con tus nuevas credenciales.');
      router.push('/auth/login');
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorProblem(err.problem);
        if (err.status === 400) {
          setIsTokenExpired(true);
        }
      } else {
        setErrorProblem({
          type: 'about:blank',
          title: 'Error al restablecer',
          detail: 'No fue posible actualizar la contraseña. El enlace puede haber expirado.',
          instance: '/auth/reset-password',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white py-8 px-6 sm:px-10 border border-[#e2e8f0] rounded-xl shadow-card space-y-6">
      {errorProblem && (
        <BannerError
          error={errorProblem}
          status={errorProblem.status}
          rceAction={
            isTokenExpired
              ? {
                  label: 'Solicitar un nuevo enlace',
                  onClick: () => router.push('/auth/forgot-password'),
                }
              : undefined
          }
          onDismiss={() => setErrorProblem(null)}
        />
      )}

      {clientError && (
        <div className="p-3 bg-[#fffbeb] border border-[#fde68a] rounded-lg text-xs text-[#92400e] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#f59e0b] shrink-0" />
          <span>{clientError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Nueva contraseña"
          type={showPassword ? 'text' : 'password'}
          required
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[#64748b] hover:text-[#0f172a] p-1"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg space-y-1.5 text-xs">
          <span className="font-semibold text-[#0f172a] block">Requisitos de seguridad:</span>
          <div className="grid grid-cols-2 gap-1 text-[#64748b]">
            <span className={hasMinLength ? 'text-[#10b981] font-medium' : ''}>• Mínimo 8 caracteres</span>
            <span className={hasUpper ? 'text-[#10b981] font-medium' : ''}>• 1 mayúscula</span>
            <span className={hasLower ? 'text-[#10b981] font-medium' : ''}>• 1 minúscula</span>
            <span className={hasNumber ? 'text-[#10b981] font-medium' : ''}>• 1 número</span>
            <span className={hasSymbol ? 'text-[#10b981] font-medium' : ''}>• 1 símbolo especial</span>
          </div>
        </div>

        <Input
          label="Confirmar contraseña"
          type={showPassword ? 'text' : 'password'}
          required
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
        />

        <div className="pt-2">
          {isTokenExpired ? (
            <Button
              type="button"
              variant="primary"
              className="w-full justify-center h-10 font-semibold"
              onClick={() => router.push('/auth/forgot-password')}
            >
              Solicitar un nuevo enlace
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              disabled={!isSecure}
              className="w-full justify-center h-10 font-semibold"
            >
              Guardar nueva contraseña
            </Button>
          )}
        </div>

        <div className="pt-2 text-center">
          <Link href="/auth/login" className="text-xs text-[#64748b] hover:text-[#0f172a]">
            Volver a Iniciar sesión
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-xl bg-[#1d63ed] items-center justify-center text-white font-bold text-xl shadow-md mb-4">
          AL
        </div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Establecer Nueva Contraseña</h1>
        <p className="mt-1 text-sm text-[#64748b]">Ingresa y confirma tu nueva clave de acceso</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense fallback={<div className="bg-white p-8 rounded-xl shadow-card h-80 animate-pulse" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
