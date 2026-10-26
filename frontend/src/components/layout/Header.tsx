'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Warehouse, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getCurrentUser } from '@/lib/auth';

interface Bodega {
  id: string;
  nombre: string;
  codigo?: string;
  activo: boolean;
}

export function Header() {
  const router = useRouter();
  const user = getCurrentUser();
  const [selectedBodega, setSelectedBodega] = useState<string>('');

  // Carga de bodegas activas
  const { data: bodegas = [] } = useQuery<Bodega[]>({
    queryKey: ['bodegas'],
    queryFn: () => api<Bodega[]>('/bodegas'),
  });

  // Verificación de salud del sistema
  const { data: health } = useQuery({
    queryKey: ['health-ready'],
    queryFn: () => api<{ status?: string; checks?: any }>('/health/ready'),
    staleTime: 60000,
  });

  const handleLogout = () => {
    clearSession();
    router.push('/auth/login');
  };

  return (
    <header className="sticky top-0 z-20 h-[60px] bg-white border-b border-[#e2e8f0] px-6 flex items-center justify-between">
      {/* Search / Global utility */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar repuesto, cliente o factura..."
            className="w-full h-[36px] pl-9 pr-3 text-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-md focus:bg-white focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-[#1d63ed]/15 transition-all text-[#0f172a]"
          />
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Selector de Bodega */}
        <div className="flex items-center gap-2 text-xs text-[#64748b]">
          <Warehouse className="w-4 h-4 text-[#1d63ed]" />
          <select
            value={selectedBodega}
            onChange={(e) => setSelectedBodega(e.target.value)}
            className="h-[32px] px-2 text-xs bg-white border border-[#e2e8f0] rounded-md text-[#0f172a] focus:outline-none focus:border-[#1d63ed]"
          >
            <option value="">Todas las bodegas</option>
            {bodegas
              .filter((b) => b.activo !== false)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} {b.codigo ? `(${b.codigo})` : ''}
                </option>
              ))}
          </select>
        </div>

        {/* Health status dot */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-full text-[11px] text-[#64748b]">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" />
          <span className="font-medium hidden sm:inline">Sistema Operativo</span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#64748b] hover:text-[#ef4444] hover:bg-[#fef2f2] rounded-md transition-colors font-medium border border-transparent hover:border-[#fecaca]"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
