'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders, Building, Hash, Save, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { BannerError } from '@/components/ui/BannerError';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';

export default function CatalogosPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();

  const [isEditConsecutivo, setIsEditConsecutivo] = useState(false);
  const [selectedConsecutivo, setSelectedConsecutivo] = useState<any | null>(null);
  const [siguienteNumero, setSiguienteNumero] = useState('');
  const [motivoConsecutivo, setMotivoConsecutivo] = useState('');
  const [consecutivoError, setConsecutivoError] = useState<ProblemDetails | null>(null);

  // 1. Configuración de empresa
  const { data: empresa } = useQuery({
    queryKey: ['configuracion-empresa'],
    queryFn: () => api<any>('/configuracion/empresa'),
  });

  // 2. Consecutivos
  const {
    data: consecutivos = [],
    isLoading: loadingConsecutivos,
    refetch: refetchConsecutivos,
  } = useQuery<any[]>({
    queryKey: ['consecutivos'],
    queryFn: () => api<any[]>('/consecutivos'),
  });

  // Mutación: Ajustar Consecutivo
  const consecutivoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConsecutivo) return;
      return api(`/consecutivos/${selectedConsecutivo.tipo}`, {
        method: 'PATCH',
        body: JSON.stringify({
          siguiente: parseInt(siguienteNumero, 10),
          motivo: motivoConsecutivo.trim(),
        }),
      });
    },
    onSuccess: () => {
      success('Numeración Actualizada', 'El consecutivo ha sido actualizado en la base de datos.');
      setIsEditConsecutivo(false);
      setMotivoConsecutivo('');
      setConsecutivoError(null);
      refetchConsecutivos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setConsecutivoError(err.problem);
      }
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Catálogos y Parámetros</h1>
          <p className="text-xs text-[#64748b]">
            Configuración institucional y control de numeración transaccional
          </p>
        </div>

        {/* Datos de Empresa */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#e2e8f0]">
            <Building className="w-4 h-4 text-[#1d63ed]" />
            <h3 className="text-sm font-semibold text-[#0f172a]">Datos Institucionales de la Empresa</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[#64748b] block">Razón Social:</span>
              <span className="font-semibold text-[#0f172a] text-sm">
                {empresa?.razonSocial || 'Distribuidora de Repuestos Automotrices S.A.S.'}
              </span>
            </div>
            <div>
              <span className="text-[#64748b] block">NIT / Identificación Fiscal:</span>
              <span className="font-semibold text-[#0f172a] text-sm">
                {empresa?.nit || '901.234.567-8'}
              </span>
            </div>
            <div>
              <span className="text-[#64748b] block">Régimen Tributario:</span>
              <span className="text-[#0f172a]">Responsable de IVA</span>
            </div>
            <div>
              <span className="text-[#64748b] block">Moneda de Operación:</span>
              <span className="text-[#0f172a]">Peso Colombiano (COP)</span>
            </div>
          </div>
        </div>

        {/* Consecutivos */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-[#1d63ed]" />
              <h3 className="text-sm font-semibold text-[#0f172a]">Numeración y Consecutivos</h3>
            </div>
            <span className="text-xs text-[#64748b]">Asignación secuencial bloqueada</span>
          </div>

          {loadingConsecutivos ? (
            <div className="p-4">
              <TableSkeleton rows={3} cols={4} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Tipo Documento</th>
                    <th className="py-3 px-4">Prefijo</th>
                    <th className="py-3 px-4 text-right">Siguiente Consecutivo</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {consecutivos.map((c: any) => (
                    <tr key={c.tipo || c.id} className="hover:bg-[#f8fafc]">
                      <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{c.tipo}</td>
                      <td className="py-3.5 px-4 text-[#64748b] font-mono">{c.prefijo || '—'}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#0f172a] tabular-nums">
                        {c.siguiente ?? c.actual ?? 1}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedConsecutivo(c);
                            setSiguienteNumero(String((c.siguiente ?? c.actual ?? 1) + 1));
                            setConsecutivoError(null);
                            setIsEditConsecutivo(true);
                          }}
                        >
                          Avanzar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Ajustar Consecutivo */}
        <Modal
          isOpen={isEditConsecutivo}
          onClose={() => setIsEditConsecutivo(false)}
          title={`Avanzar Consecutivo — ${selectedConsecutivo?.tipo}`}
          subtitle="Por regla de negocio, los consecutivos nunca retroceden"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsEditConsecutivo(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={consecutivoMutation.isPending}
                disabled={!siguienteNumero || !motivoConsecutivo.trim()}
                onClick={() => consecutivoMutation.mutate()}
              >
                Actualizar Número
              </Button>
            </div>
          }
        >
          {consecutivoError && <BannerError error={consecutivoError} status={consecutivoError.status} />}
          <div className="space-y-4">
            <Input
              label="Siguiente Número de Consecutivo *"
              type="number"
              required
              value={siguienteNumero}
              onChange={(e) => setSiguienteNumero(e.target.value)}
              helperText={`Valor actual: ${selectedConsecutivo?.siguiente ?? selectedConsecutivo?.actual}`}
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Motivo Obligatorio del Cambio *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Ej. Sincronización con talonario previo de remisiones"
                value={motivoConsecutivo}
                onChange={(e) => setMotivoConsecutivo(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
