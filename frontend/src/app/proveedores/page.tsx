'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Search,
  Plus,
  Receipt,
  CreditCard,
  Package,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { BannerError } from '@/components/ui/BannerError';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { can, getCurrentUser } from '@/lib/auth';
import { formatCOP, cleanIdentification } from '@/lib/format';

interface Proveedor {
  id: string;
  tercero?: {
    id?: string;
    numeroDocumento: string;
    razonSocial: string;
    activo: boolean;
  };
  numeroDocumento?: string;
  razonSocial?: string;
  activo?: boolean;
}

export default function ProveedoresPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);

  // Estados modal nuevo proveedor
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNumDoc, setNewNumDoc] = useState('');
  const [newRazonSocial, setNewRazonSocial] = useState('');
  const [createError, setCreateError] = useState<ProblemDetails | null>(null);

  // Consulta de proveedores
  const {
    data: proveedoresData,
    isLoading: loadingProveedores,
    error: errorProveedores,
    refetch: refetchProveedores,
  } = useQuery({
    queryKey: ['proveedores', searchTerm, isAdmin],
    queryFn: async () => {
      if (isAdmin && !searchTerm) {
        const res = await api<{ data: Proveedor[]; meta: { total: number } }>('/proveedores?limit=50');
        return res.data;
      } else {
        const res = await api<Proveedor[]>(`/proveedores/buscar?q=${encodeURIComponent(searchTerm)}`);
        return res;
      }
    },
  });

  // Consulta de CxP del proveedor seleccionado
  const { data: cxpData = [] } = useQuery({
    queryKey: ['proveedor-cxp', selectedProveedor?.id],
    queryFn: () => api<any[]>(`/cuentas-por-pagar?proveedorId=${selectedProveedor?.id}`),
    enabled: !!selectedProveedor?.id,
  });

  // Crear proveedor
  const createMutation = useMutation({
    mutationFn: async () => {
      return api('/proveedores', {
        method: 'POST',
        body: JSON.stringify({
          numeroDocumento: cleanIdentification(newNumDoc),
          razonSocial: newRazonSocial.trim(),
        }),
      });
    },
    onSuccess: () => {
      success('Proveedor registrado', 'El proveedor ha sido añadido exitosamente.');
      setIsCreateOpen(false);
      setNewNumDoc('');
      setNewRazonSocial('');
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setCreateError(err.problem);
      }
    },
  });

  const proveedoresList: Proveedor[] = Array.isArray(proveedoresData) ? proveedoresData : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Directorio de Proveedores</h1>
            <p className="text-xs text-[#64748b]">
              Registro de fabricantes, distribuidores de autopartes y cuentas por pagar
            </p>
          </div>

          <div className="flex items-center gap-3">
            {can('terceros.crear') && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setIsCreateOpen(true)}
              >
                Nuevo Proveedor
              </Button>
            )}
          </div>
        </div>

        {/* Buscador */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-card">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar proveedor por NIT o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[38px] pl-9 pr-3 text-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-md focus:bg-white focus:outline-none focus:border-[#1d63ed]"
            />
          </div>
        </div>

        {errorProveedores && (
          <BannerError
            error={errorProveedores}
            rceAction={{ label: 'Reintentar', onClick: () => refetchProveedores() }}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden ${selectedProveedor ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {loadingProveedores ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={3} />
              </div>
            ) : proveedoresList.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-8 h-8" />}
                title={searchTerm ? 'No hay proveedores coincidentes' : 'No hay proveedores registrados'}
                description="Registra un proveedor para gestionar órdenes de compra y facturas XML."
                actionLabel={can('terceros.crear') ? 'Nuevo Proveedor' : undefined}
                onAction={() => setIsCreateOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">NIT / Documento</th>
                      <th className="py-3 px-4">Razón Social</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {proveedoresList.map((prov) => {
                      const doc = prov.tercero?.numeroDocumento || prov.numeroDocumento || '—';
                      const nombre = prov.tercero?.razonSocial || prov.razonSocial || 'Sin nombre';
                      const isSelected = selectedProveedor?.id === prov.id;

                      return (
                        <tr
                          key={prov.id}
                          onClick={() => setSelectedProveedor(prov)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-[#eff4ff]' : 'hover:bg-[#f8fafc]'}`}
                        >
                          <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{doc}</td>
                          <td className="py-3.5 px-4 font-medium text-[#0f172a]">{nombre}</td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProveedor(prov);
                              }}
                            >
                              Ver CxP
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedProveedor && (
            <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-[#e2e8f0]">
                <div>
                  <h3 className="text-base font-semibold text-[#0f172a]">
                    {selectedProveedor.tercero?.razonSocial || selectedProveedor.razonSocial}
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    NIT: {selectedProveedor.tercero?.numeroDocumento || selectedProveedor.numeroDocumento}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProveedor(null)}
                  className="text-xs text-[#64748b] hover:text-[#0f172a]"
                >
                  Cerrar
                </button>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block mb-2">
                  Cuentas por Pagar Activas
                </span>
                {cxpData.length === 0 ? (
                  <p className="text-xs text-[#64748b] py-3">No hay saldos pendientes con este proveedor.</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {cxpData.map((item: any, idx: number) => (
                      <div key={idx} className="p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-md flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-[#0f172a]">{item.numeroFactura || `Factura #${idx + 1}`}</span>
                          <span className="text-[11px] text-[#64748b] block">Vence: {item.fechaVencimiento || '—'}</span>
                        </div>
                        <span className="font-bold text-[#0f172a] tabular-nums">
                          {formatCOP(item.saldo ?? item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Crear Proveedor */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Nuevo Proveedor"
          subtitle="Registra los datos de identificación fiscal"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={createMutation.isPending}
                disabled={!newNumDoc || !newRazonSocial}
                onClick={() => createMutation.mutate()}
              >
                Guardar Proveedor
              </Button>
            </div>
          }
        >
          {createError && <BannerError error={createError} status={createError.status} />}
          <div className="space-y-4">
            <Input
              label="NIT o Documento de Identificación *"
              type="text"
              required
              placeholder="Ej. 900876543"
              value={newNumDoc}
              onChange={(e) => setNewNumDoc(cleanIdentification(e.target.value))}
            />
            <Input
              label="Razón Social o Nombre del Proveedor *"
              type="text"
              required
              placeholder="Ej. Importadora y Frenos del Valle S.A.S."
              value={newRazonSocial}
              onChange={(e) => setNewRazonSocial(e.target.value)}
            />
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
