'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldX, Mail, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';

function AccessDeniedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const servicio = searchParams.get('servicio') || 'el recurso solicitado';
  const user = getCurrentUser();

  const handleRequestPermission = () => {
    const subject = encodeURIComponent(`Solicitud de acceso: ${servicio}`);
    const body = encodeURIComponent(
      `Hola Administrador,\n\nSolicito acceso al servicio/módulo "${servicio}" para mi cuenta (${user?.email || 'mi usuario'}).\n\nMotivo:\n`
    );
    window.location.href = `mailto:admin@crmcontable.com?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-[#fef2f2] border border-[#fecaca] flex items-center justify-center text-[#ef4444] mb-6 shadow-sm">
        <ShieldX className="w-8 h-8" />
      </div>

      <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Acceso Restringido</h1>
      <p className="mt-2 text-sm text-[#64748b] leading-relaxed">
        Tu rol actual no cuenta con los permisos suficientes para interactuar con{' '}
        <span className="font-semibold text-[#0f172a]">{servicio}</span>.
      </p>

      <div className="mt-6 w-full max-w-sm bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card text-left space-y-2 text-xs">
        <div className="flex justify-between items-center py-1 border-b border-[#f1f5f9]">
          <span className="text-[#64748b]">Usuario en sesión:</span>
          <span className="font-semibold text-[#0f172a]">{user?.email || 'No identificado'}</span>
        </div>
        <div className="flex justify-between items-center py-1 border-b border-[#f1f5f9]">
          <span className="text-[#64748b]">Rol asignado:</span>
          <span className="font-semibold text-[#0f172a]">
            {user?.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}
          </span>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-[#64748b]">Código HTTP:</span>
          <span className="font-semibold text-[#ef4444]">403 Forbidden (RBAC)</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="outline"
          icon={<Home className="w-4 h-4" />}
          onClick={() => router.push('/dashboard')}
        >
          Volver al Inicio
        </Button>
        <Button
          variant="primary"
          icon={<Mail className="w-4 h-4" />}
          onClick={handleRequestPermission}
        >
          Solicitar permisos al Administrador
        </Button>
      </div>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <Suspense fallback={<div className="h-64 w-80 bg-white rounded-xl shadow-card animate-pulse" />}>
        <AccessDeniedContent />
      </Suspense>
    </div>
  );
}
