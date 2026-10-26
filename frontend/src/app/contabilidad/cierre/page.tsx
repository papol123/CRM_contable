'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lock,
  Unlock,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/Card';
import { BannerError } from '@/components/ui/BannerError';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { formatCOP, formatPeriodo } from '@/lib/format';

export default function CierrePage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  // Modal Cerrar Mes
  const [isCerrarOpen, setIsCerrarOpen] = useState(false);
  const [periodoACerrar, setPeriodoACerrar] = useState('');
  const [cerrarObservaciones, setCerrarObservaciones] = useState('');
  const [cerrarError, setCerrarError] = useState<ProblemDetails | null>(null);

  // Modal Reabrir Mes
  const [isReabrirOpen, setIsReabrirOpen] = useState(false);
  const [selectedPeriodoId, setSelectedPeriodoId] = useState('');
  const [reabrirMotivo, setReabrirMotivo] = useState('');
  const [reabrirError, setReabrirError] = useState<ProblemDetails | null>(null);

  // Exportaciones asíncronas (Jobs)
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // 1. Estado de resultados
  const { data: estadoResultados, isLoading: loadingResultados } = useQuery({
    queryKey: ['reportes-estado-resultados'],
    queryFn: () => api<any>('/reportes/estado-resultados'),
    enabled: isAdmin,
  });

  // 2. Periodos contables
  const {
    data: periodos = [],
    isLoading: loadingPeriodos,
    refetch: refetchPeriodos,
  } = useQuery<any[]>({
    queryKey: ['periodos-contables'],
    queryFn: () => api<any[]>('/periodos-contables'),
    enabled: isAdmin,
  });

  // 3. Polling de Job de exportación
  const { data: jobStatus } = useQuery({
    queryKey: ['reporte-job', activeJobId],
    queryFn: () => api<any>(`/reportes/jobs/${activeJobId}`),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const state = query.state.data?.estado;
      return state === 'COMPLETADO' || state === 'FALLIDO' ? false : 3000;
    },
  });

  // Mutación: Cerrar Mes
  const cerrarMutation = useMutation({
    mutationFn: async () => {
      return api('/reportes/cierre-mensual', {
        method: 'POST',
        body: JSON.stringify({
          periodo: periodoACerrar,
          observaciones: cerrarObservaciones.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      success('Periodo Cerrado', `El periodo ${periodoACerrar} ha sido bloqueado para modificaciones.`);
      setIsCerrarOpen(false);
      setPeriodoACerrar('');
      setCerrarError(null);
      refetchPeriodos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setCerrarError(err.problem);
      }
    },
  });

  // Mutación: Reabrir Periodo
  const reabrirMutation = useMutation({
    mutationFn: async () => {
      return api(`/periodos-contables/${selectedPeriodoId}/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ motivo: reabrirMotivo.trim() }),
      });
    },
    onSuccess: () => {
      success('Periodo Reabierto', 'El periodo ha sido habilitado nuevamente para ajustes.');
      setIsReabrirOpen(false);
      setReabrirMotivo('');
      setReabrirError(null);
      refetchPeriodos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setReabrirError(err.problem);
      }
    },
  });

  // Mutación: Iniciar Exportación Asíncrona
  const exportMutation = useMutation({
    mutationFn: async (tipo: string) => {
      return api<{ jobId: string }>('/reportes/exportar', {
        method: 'POST',
        body: JSON.stringify({ tipo }),
      });
    },
    onSuccess: (data) => {
      success('Exportación Iniciada', 'El reporte se está procesando en segundo plano.');
      setActiveJobId(data.jobId);
    },
  });

  const handleDownloadCsv = async () => {
    if (!activeJobId) return;
    try {
      const res = await api<Response>(`/reportes/jobs/${activeJobId}/descargar`, { raw: true });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${activeJobId.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('El archivo no está disponible o aún se está procesando.');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Cierre y Reportes Contables</h1>
            <p className="text-xs text-[#64748b]">
              Inmutabilidad de periodos mensuales y exportaciones financieras en segundo plano
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              icon={<FileSpreadsheet className="w-4 h-4" />}
              isLoading={exportMutation.isPending}
              onClick={() => exportMutation.mutate('inventario')}
            >
              Exportar Inventario CSV
            </Button>
            <Button
              variant="primary"
              icon={<Lock className="w-4 h-4" />}
              onClick={() => {
                setCerrarError(null);
                setIsCerrarOpen(true);
              }}
            >
              Cerrar Mes Terminado
            </Button>
          </div>
        </div>

        {/* Estado del Job asíncrono activo si existe */}
        {activeJobId && (
          <div className="bg-[#eff4ff] border border-[#b3c5ff] rounded-lg p-4 flex items-center justify-between text-xs text-[#1d63ed]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              <span>
                Job <strong>{activeJobId.substring(0, 8)}</strong> — Estado:{' '}
                <strong>{jobStatus?.estado || 'PROCESANDO'}</strong>
              </span>
            </div>
            {jobStatus?.estado === 'COMPLETADO' && (
              <Button size="sm" variant="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={handleDownloadCsv}>
                Descargar CSV
              </Button>
            )}
          </div>
        )}

        {/* KPIs Financieros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingResultados ? (
            <TableSkeleton rows={3} cols={4} />
          ) : (
            <>
              <KpiCard
                title="Total Ingresos"
                value={formatCOP(estadoResultados?.totalIngresos ?? 0)}
                subtitle="Facturación neta acumulada"
              />
              <KpiCard
                title="Costo de Mercancía"
                value={formatCOP(estadoResultados?.totalCostos ?? 0)}
                subtitle="Costo de repuestos vendidos"
              />
              <KpiCard
                title="Gastos Operativos"
                value={formatCOP(estadoResultados?.totalGastos ?? 0)}
                subtitle="Administración y ventas"
              />
              <KpiCard
                title="Utilidad Neta"
                value={formatCOP(estadoResultados?.utilidadNeta ?? 0)}
                subtitle="Margen neto del ejercicio"
                badge={<Badge variant="active">Positivo</Badge>}
              />
            </>
          )}
        </div>

        {/* Tabla de Periodos Contables */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0f172a]">Histórico de Periodos Contables</h3>
            <span className="text-xs text-[#64748b]">Protección inmutable de libros</span>
          </div>

          {loadingPeriodos ? (
            <div className="p-4">
              <TableSkeleton rows={5} cols={4} />
            </div>
          ) : periodos.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748b]">
              No hay periodos cerrados en el histórico.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Periodo</th>
                    <th className="py-3 px-4">Año</th>
                    <th className="py-3 px-4">Mes</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {periodos.map((p: any) => {
                    const idPeriodo = p.id_periodo || p.id;
                    const isClosed = p.estado === 'CERRADO' || !p.abierto;

                    return (
                      <tr key={idPeriodo} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 font-semibold text-[#0f172a]">
                          {formatPeriodo(`${p.anio}-${String(p.mes).padStart(2, '0')}`)}
                        </td>
                        <td className="py-3.5 px-4 text-[#64748b]">{p.anio}</td>
                        <td className="py-3.5 px-4 text-[#64748b]">{p.mes}</td>
                        <td className="py-3.5 px-4 text-center">
                          {isClosed ? (
                            <Badge variant="inactive">Cerrado</Badge>
                          ) : (
                            <Badge variant="active">Abierto</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isClosed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Unlock className="w-3 h-3 text-[#f59e0b]" />}
                              onClick={() => {
                                setSelectedPeriodoId(idPeriodo);
                                setReabrirError(null);
                                setReabrirMotivo('');
                                setIsReabrirOpen(true);
                              }}
                            >
                              Reabrir
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Cerrar Mes */}
        <Modal
          isOpen={isCerrarOpen}
          onClose={() => setIsCerrarOpen(false)}
          title="Cierre Contable Mensual"
          subtitle="Bloqueo inmutable de transacciones para el periodo indicado"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsCerrarOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={cerrarMutation.isPending}
                disabled={!periodoACerrar}
                onClick={() => cerrarMutation.mutate()}
              >
                Ejecutar Cierre
              </Button>
            </div>
          }
        >
          {cerrarError && <BannerError error={cerrarError} status={cerrarError.status} />}

          <div className="space-y-4">
            <p className="text-xs text-[#64748b]">
              Solo es posible cerrar meses ya concluidos. Una vez cerrado el mes, ninguna remisión, compra o gasto podrá registrarse con fecha de ese periodo.
            </p>

            <Input
              label="Periodo a Cerrar (AAAA-MM) *"
              type="month"
              required
              value={periodoACerrar}
              onChange={(e) => setPeriodoACerrar(e.target.value)}
              helperText="Selecciona un mes ya finalizado"
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Observaciones del Cierre
              </label>
              <textarea
                rows={2}
                placeholder="Ej. Cierre regular con conciliación de inventario completada..."
                value={cerrarObservaciones}
                onChange={(e) => setCerrarObservaciones(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>

        {/* Modal: Reabrir Mes */}
        <Modal
          isOpen={isReabrirOpen}
          onClose={() => setIsReabrirOpen(false)}
          title="Reabrir Periodo Contable"
          subtitle="Requiere motivo explícito para auditoría"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsReabrirOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={reabrirMutation.isPending}
                disabled={!reabrirMotivo.trim()}
                onClick={() => reabrirMutation.mutate()}
              >
                Confirmar Reapertura
              </Button>
            </div>
          }
        >
          {reabrirError && <BannerError error={reabrirError} status={reabrirError.status} />}

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Motivo de Reapertura *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Ej. Ajuste de factura de compra extemporánea aprobada por gerencia"
                value={reabrirMotivo}
                onChange={(e) => setReabrirMotivo(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
