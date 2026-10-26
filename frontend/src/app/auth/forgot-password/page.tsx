'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { api, ProblemDetails } from '@/lib/api';

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorProblem, setErrorProblem] = useState<ProblemDetails | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setErrorProblem({
        type: 'about:blank',
        title: 'Correo inválido',
        detail: 'Por favor ingresa un correo electrónico válido.',
        instance: '/auth/forgot-password',
      });
      return;
    }

    setIsLoading(true);
    setErrorProblem(null);

    try {
      await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setIsSuccess(true);
    } catch {
      setIsSuccess(true);
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
          onDismiss={() => setErrorProblem(null)}
        />
      )}

      {isSuccess ? (
        <div className="space-y-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#ecfdf5] border border-[#a7f3d0] flex items-center justify-center text-[#10b981]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#0f172a]">Enlace de recuperación enviado</h3>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Si los datos coinciden con un usuario registrado, recibirás un correo electrónico con instrucciones para restablecer tu contraseña. El enlace es válido durante 30 minutos.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => router.push('/auth/login')}
            >
              Volver a Ingresar
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Correo electrónico corporativo"
            type="email"
            required
            placeholder="nombre@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            helperText="Enviaremos un token seguro a este correo"
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full justify-center h-10 font-semibold"
            >
              Recibir enlace de recuperación
            </Button>
          </div>

          <div className="pt-4 text-center">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#0f172a] font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al inicio de sesión
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-xl bg-[#1d63ed] items-center justify-center text-white font-bold text-xl shadow-md mb-4">
          AL
        </div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Recuperación de Acceso</h1>
        <p className="mt-1 text-sm text-[#64748b]">Solicita un enlace seguro para restablecer tu contraseña</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense fallback={<div className="bg-white p-8 rounded-xl shadow-card h-64 animate-pulse" />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
