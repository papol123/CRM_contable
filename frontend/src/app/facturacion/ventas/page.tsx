'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Search,
  Plus,
  FileText,
  Ban,
  ArrowRight,
  Eye,
  Download,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { BannerError } from '@/components/ui/BannerError';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { can, getCurrentUser } from '@/lib/auth';
import { formatCOP, formatDate } from '@/lib/format';

export default function VentasPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenta, setSelectedVenta] = useState<any | null>(null);

  // Modal de Anulación
  const [isAnularOpen, setIsAnularOpen] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [anularError, setAnularError] = useState<ProblemDetails | null>(null);

  // Listar Remisiones
  const {
    data: ventasData,
    isLoading: loadingVentas,
    error: errorVentas,
    refetch: refetchVentas,
  } = useQuery({
    queryKey: ['facturas-venta'],
    queryFn: () => api<{ data: any[]; meta: { total: number } }>('/facturas-venta?limit=50'),
  });

  // Anulación (Admin)
  const anularMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVenta) return;
      return api(`/facturas-venta/${selectedVenta.id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: anularMotivo.trim() }),
      });
    },
    onSuccess: () => {
      success('Remisión Anulada', 'Se crearon los movimientos compensatorios correspondientes en el Kardex.');
      setIsAnularOpen(false);
      setAnularMotivo('');
      setAnularError(null);
      refetchVentas();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setAnularError(err.problem);
      }
    },
  });

  const handleDownloadPdf = async (id: string, numero: string) => {
    try {
      const res = await api<Response>(`/facturas-venta/${id}/pdf`, { raw: true });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remision-${numero || 'venta'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Error descargando el PDF de la remisión.');
    }
  };

  const ventasList = ventasData?.data || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Remisiones de Venta</h1>
            <p className="text-xs text-[#64748b]">
              Historial de remisiones comerciales internas y estados de entrega
            </p>
          </div>

          <Link href="/facturacion/nueva">
            <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
              Nueva Remisión
            </Button>
          </Link>
        </div>

        {errorVentas && (
          <BannerError
            error={errorVentas}
            rceAction={{ label: 'Reintentar', onClick: () => refetchVentas() }}
          />
        )}

        {/* Tabla de Remisiones */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
          {loadingVentas ? (
            <div className="p-4">
              <TableSkeleton rows={6} cols={5} />
            </div>
          ) : ventasList.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-8 h-8" />}
              title="Aún no hay remisiones registradas"
              description="Crea la primera remisión para emitir una orden de salida de repuestos."
              actionLabel="Nueva Remisión"
              onAction={() => (window.location.href = '/facturacion/nueva')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Número</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {ventasList.map((v: any) => {
                    const isAnulada = v.anulada || v.estado === 'ANULADA';

                    return (
                      <tr key={v.id} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[#0f172a]">{v.numeroVenta || v.numero}</td>
                        <td className="py-3.5 px-4 text-[#64748b]">{formatDate(v.fechaEmision || v.createdAt)}</td>
                        <td className="py-3.5 px-4 font-medium text-[#0f172a]">
                          {v.cliente?.tercero?.razonSocial || v.cliente?.razonSocial || 'Cliente Mostrador'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#0f172a] tabular-nums">
                          {formatCOP(v.total)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isAnulada ? (
                            <Badge variant="error">Anulada</Badge>
                          ) : (
                            <Badge variant="active">Emitida</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleDownloadPdf(v.id, v.numeroVenta || v.numero)}
                            title="Descargar PDF"
                            className="p-1.5 text-[#64748b] hover:text-[#1d63ed] rounded hover:bg-[#eff4ff]"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {isAdmin && !isAnulada && can('ventas.anular') && (
                            <button
                              onClick={() => {
                                setSelectedVenta(v);
                                setAnularError(null);
                                setAnularMotivo('');
                                setIsAnularOpen(true);
                              }}
                              title="Anular remisión"
                              className="p-1.5 text-[#64748b] hover:text-[#ef4444] rounded hover:bg-[#fef2f2]"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
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

        {/* Modal: Anular Remisión (Admin) */}
        <Modal
          isOpen={isAnularOpen}
          onClose={() => setIsAnularOpen(false)}
          title={`Anular Remisión ${selectedVenta?.numeroVenta || ''}`}
          subtitle="Esta acción revierte los movimientos de salida en el Kardex"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsAnularOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                isLoading={anularMutation.isPending}
                disabled={!anularMotivo.trim()}
                onClick={() => anularMutation.mutate()}
              >
                Confirmar Anulación
              </Button>
            </div>
          }
        >
          {anularError && <BannerError error={anularError} status={anularError.status} />}

          <div className="space-y-3">
            <p className="text-xs text-[#64748b]">
              La anulación generará un contra-movimiento de entrada automática en inventario y cerrará la remisión de forma definitiva.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Motivo Obligatorio *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Ej. Devolución acordada con el cliente / Error en la orden de despacho"
                value={anularMotivo}
                onChange={(e) => setAnularMotivo(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
