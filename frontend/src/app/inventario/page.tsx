'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Search,
  Warehouse,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  History,
  AlertTriangle,
  ClipboardList,
  Plus,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/Card';
import { BannerError } from '@/components/ui/BannerError';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton, KpiSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { can, getCurrentUser } from '@/lib/auth';
import { formatCOP, formatDate } from '@/lib/format';

interface Bodega {
  id: string;
  nombre: string;
  codigo?: string;
  activo?: boolean;
}

interface ItemInventario {
  idProducto: string;
  codigo: string;
  nombre?: string;
  descripcion?: string;
  idBodega: string;
  disponible: number;
  stockMinimo?: number;
  costoUnitario?: number;
}

export default function InventarioPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBodegaId, setSelectedBodegaId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ItemInventario | null>(null);

  // Modal Movimiento (Entrada / Salida / Traslado)
  const [isMovOpen, setIsMovOpen] = useState(false);
  const [movType, setMovType] = useState<'ENTRADA' | 'SALIDA' | 'TRASLADO'>('SALIDA');
  const [movBodegaId, setMovBodegaId] = useState('');
  const [movBodegaDestinoId, setMovBodegaDestinoId] = useState('');
  const [movCantidad, setMovCantidad] = useState(1);
  const [movMotivo, setMovMotivo] = useState('');
  const [movError, setMovError] = useState<ProblemDetails | null>(null);

  // 1. Catálogo de bodegas
  const { data: bodegas = [] } = useQuery<Bodega[]>({
    queryKey: ['bodegas'],
    queryFn: () => api<Bodega[]>('/bodegas'),
  });

  // 2. Saldos de inventario (GET /inventario?limit=100 o búsqueda rápida)
  const {
    data: inventarioData,
    isLoading: loadingInventario,
    error: errorInventario,
    refetch: refetchInventario,
  } = useQuery({
    queryKey: ['inventario', searchTerm, selectedBodegaId],
    queryFn: async () => {
      if (searchTerm) {
        return api<ItemInventario[]>(`/productos/buscar?q=${encodeURIComponent(searchTerm)}`);
      }
      const res = await api<{ data: ItemInventario[]; meta: { total: number } }>('/inventario?limit=100');
      return res.data;
    },
  });

  // 3. Valorizado de inventario (Admin)
  const { data: valorizado } = useQuery({
    queryKey: ['inventario-valorizado'],
    queryFn: () => api<any>('/inventario/valorizado'),
    enabled: isAdmin && can('inventario.costos'),
  });

  // 4. Kardex del producto seleccionado
  const { data: kardexData, isLoading: loadingKardex } = useQuery({
    queryKey: ['kardex', selectedProduct?.idProducto],
    queryFn: () => api<{ movimientos: any[] }>(`/inventario/${selectedProduct?.idProducto}/kardex`),
    enabled: !!selectedProduct?.idProducto,
  });

  // Mutación: Registrar Movimiento (Entrada / Salida / Traslado)
  const movMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) return;

      if (movType === 'ENTRADA') {
        return api('/inventario/entradas', {
          method: 'POST',
          body: JSON.stringify({
            idProducto: selectedProduct.idProducto,
            idBodega: movBodegaId || selectedProduct.idBodega,
            cantidad: Number(movCantidad),
            motivo: movMotivo.trim(),
          }),
        });
      } else if (movType === 'SALIDA') {
        return api('/inventario/salidas', {
          method: 'POST',
          body: JSON.stringify({
            idProducto: selectedProduct.idProducto,
            idBodega: movBodegaId || selectedProduct.idBodega,
            cantidad: Number(movCantidad),
            motivo: movMotivo.trim(),
          }),
        });
      } else {
        return api('/inventario/traslados', {
          method: 'POST',
          body: JSON.stringify({
            idProducto: selectedProduct.idProducto,
            idBodegaOrigen: movBodegaId || selectedProduct.idBodega,
            idBodegaDestino: movBodegaDestinoId,
            cantidad: Number(movCantidad),
            observacion: movMotivo.trim(),
          }),
        });
      }
    },
    onSuccess: () => {
      success('Movimiento registrado', 'El saldo en inventario y el Kardex han sido actualizados.');
      setIsMovOpen(false);
      setMovMotivo('');
      setMovError(null);
      refetchInventario();
      queryClient.invalidateQueries({ queryKey: ['kardex', selectedProduct?.idProducto] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setMovError(err.problem);
      }
    },
  });

  const itemsList: ItemInventario[] = Array.isArray(inventarioData) ? inventarioData : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Control de Inventario</h1>
            <p className="text-xs text-[#64748b]">
              Kardex en tiempo real, traslados entre sedes y niveles de stock
            </p>
          </div>

          <div className="flex items-center gap-3">
            {can('inventario.movimientos') && (
              <Button
                variant="primary"
                icon={<ArrowLeftRight className="w-4 h-4" />}
                onClick={() => {
                  if (!selectedProduct && itemsList.length > 0) {
                    setSelectedProduct(itemsList[0]);
                  }
                  setMovError(null);
                  setIsMovOpen(true);
                }}
              >
                Registrar Movimiento
              </Button>
            )}
          </div>
        </div>

        {/* KPIs (Admin con costos) */}
        {isAdmin && can('inventario.costos') && valorizado && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="Valor Total Inventario"
              value={formatCOP(valorizado?.totalValorizado ?? valorizado?.total ?? 0)}
              subtitle="Valuado a costo promedio ponderado"
              icon={<Warehouse className="w-5 h-5" />}
            />
            <KpiCard
              title="Referencias Totales"
              value={itemsList.length}
              subtitle="Catálogo de repuestos activos"
              icon={<Package className="w-5 h-5" />}
            />
            <KpiCard
              title="Bodegas Activas"
              value={bodegas.length}
              subtitle="Puntos de almacenamiento y sedes"
              icon={<Warehouse className="w-5 h-5" />}
            />
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-card flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código de repuesto, SKU o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[38px] pl-9 pr-3 text-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-md focus:bg-white focus:outline-none focus:border-[#1d63ed]"
            />
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <select
              value={selectedBodegaId}
              onChange={(e) => setSelectedBodegaId(e.target.value)}
              className="h-[38px] px-3 text-xs bg-white border border-[#e2e8f0] rounded-md text-[#0f172a] focus:outline-none focus:border-[#1d63ed]"
            >
              <option value="">Todas las bodegas</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorInventario && (
          <BannerError
            error={errorInventario}
            rceAction={{ label: 'Reintentar', onClick: () => refetchInventario() }}
          />
        )}

        {/* Grilla: Catálogo a la izquierda y Kardex a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden ${selectedProduct ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {loadingInventario ? (
              <div className="p-4">
                <TableSkeleton rows={6} cols={4} />
              </div>
            ) : itemsList.length === 0 ? (
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title={searchTerm ? 'No se encontraron repuestos' : 'Inventario sin registros'}
                description="No hay repuestos registrados bajo este criterio de búsqueda."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Código / SKU</th>
                      <th className="py-3 px-4">Repuesto</th>
                      <th className="py-3 px-4 text-right">Disponible</th>
                      {isAdmin && <th className="py-3 px-4 text-right">Costo Unit.</th>}
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {itemsList.map((item, idx) => {
                      const isSelected = selectedProduct?.idProducto === item.idProducto;
                      const disp = item.disponible ?? 0;
                      const min = item.stockMinimo ?? 0;
                      const isLow = disp <= min;

                      return (
                        <tr
                          key={item.idProducto || idx}
                          onClick={() => setSelectedProduct(item)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eff4ff]' : 'hover:bg-[#f8fafc]'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{item.codigo}</td>
                          <td className="py-3.5 px-4 font-medium text-[#0f172a] truncate max-w-[200px]">
                            {item.nombre || item.descripcion || item.codigo}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-[#0f172a] tabular-nums">
                            {disp}
                          </td>
                          {isAdmin && (
                            <td className="py-3.5 px-4 text-right text-[#64748b] tabular-nums">
                              {formatCOP(item.costoUnitario ?? 0)}
                            </td>
                          )}
                          <td className="py-3.5 px-4 text-center">
                            {disp === 0 ? (
                              <Badge variant="error">Agotado</Badge>
                            ) : isLow ? (
                              <Badge variant="pending">Bajo Mínimo</Badge>
                            ) : (
                              <Badge variant="active">Disponible</Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProduct(item);
                              }}
                            >
                              Ver Kardex
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

          {/* Panel Lateral: Kardex del Repuesto Seleccionado (B1 / B2) */}
          {selectedProduct && (
            <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-[#e2e8f0]">
                <div>
                  <h3 className="text-base font-semibold text-[#0f172a] truncate">
                    {selectedProduct.nombre || selectedProduct.codigo}
                  </h3>
                  <p className="text-xs text-[#64748b]">Código: {selectedProduct.codigo}</p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-xs text-[#64748b] hover:text-[#0f172a]"
                >
                  Cerrar
                </button>
              </div>

              {/* Saldo actual */}
              <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Stock disponible actual:</span>
                <span className="text-lg font-bold text-[#0f172a] tabular-nums">
                  {selectedProduct.disponible ?? 0} unidades
                </span>
              </div>

              {/* Historial Kardex */}
              <div>
                <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block mb-2">
                  Movimientos Recientes (Kardex)
                </span>

                {loadingKardex ? (
                  <TableSkeleton rows={4} cols={3} />
                ) : !kardexData?.movimientos || kardexData.movimientos.length === 0 ? (
                  <p className="text-xs text-[#64748b] py-4 text-center">
                    Este producto no registra movimientos en el periodo.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {kardexData.movimientos.map((m: any, i: number) => {
                      const isEntrada = m.tipo === 'ENTRADA' || (m.entrada && m.entrada > 0);

                      return (
                        <div
                          key={i}
                          className="p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-md text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#0f172a] flex items-center gap-1">
                              {isEntrada ? (
                                <ArrowDownRight className="w-3.5 h-3.5 text-[#10b981]" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5 text-[#ef4444]" />
                              )}
                              {m.tipo}
                            </span>
                            <span className="text-[#64748b] text-[11px]">{formatDate(m.fecha)}</span>
                          </div>

                          <div className="flex justify-between items-center text-[11px] text-[#64748b]">
                            <span>Ref: {m.referencia || m.motivo || 'Operación'}</span>
                            <span className="font-bold text-[#0f172a] tabular-nums">
                              {isEntrada ? `+${m.entrada}` : `-${m.salida}`} (Saldo: {m.saldo})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botón rápido para operar con este repuesto */}
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setMovError(null);
                    setIsMovOpen(true);
                  }}
                >
                  Nuevo Movimiento para este Repuesto
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Registrar Movimiento */}
        <Modal
          isOpen={isMovOpen}
          onClose={() => setIsMovOpen(false)}
          title="Registrar Movimiento de Inventario"
          subtitle={`Repuesto: ${selectedProduct?.codigo} — ${selectedProduct?.nombre || ''}`}
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsMovOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={movMutation.isPending}
                disabled={!movMotivo.trim() || movCantidad <= 0}
                onClick={() => movMutation.mutate()}
              >
                Confirmar {movType}
              </Button>
            </div>
          }
        >
          {movError && (
            <BannerError
              error={movError}
              status={movError.status}
              rceAction={
                movError.status === 409
                  ? {
                      label: 'Ajustar a Disponible',
                      onClick: () => {
                        setMovCantidad(selectedProduct?.disponible ?? 0);
                        setMovError(null);
                      },
                    }
                  : undefined
              }
            />
          )}

          <div className="space-y-4">
            {/* Toggle Tipo */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMovType('SALIDA')}
                className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                  movType === 'SALIDA'
                    ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]'
                    : 'bg-white border-[#e2e8f0] text-[#64748b]'
                }`}
              >
                Salida
              </button>
              <button
                type="button"
                onClick={() => setMovType('ENTRADA')}
                className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                  movType === 'ENTRADA'
                    ? 'bg-[#ecfdf5] border-[#10b981] text-[#065f46]'
                    : 'bg-white border-[#e2e8f0] text-[#64748b]'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setMovType('TRASLADO')}
                className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                  movType === 'TRASLADO'
                    ? 'bg-[#fffbeb] border-[#f59e0b] text-[#92400e]'
                    : 'bg-white border-[#e2e8f0] text-[#64748b]'
                }`}
              >
                Traslado
              </button>
            </div>

            {/* Selector de Bodega */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                {movType === 'TRASLADO' ? 'Bodega Origen *' : 'Bodega *'}
              </label>
              <select
                value={movBodegaId || selectedProduct?.idBodega}
                onChange={(e) => setMovBodegaId(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>

            {movType === 'TRASLADO' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  Bodega Destino *
                </label>
                <select
                  value={movBodegaDestinoId}
                  onChange={(e) => setMovBodegaDestinoId(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  <option value="">Selecciona bodega destino</option>
                  {bodegas
                    .filter((b) => b.id !== (movBodegaId || selectedProduct?.idBodega))
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Cantidad y Motivo */}
            <Input
              label="Cantidad *"
              type="number"
              min={1}
              required
              value={movCantidad}
              onChange={(e) => setMovCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))}
              helperText={
                movType === 'SALIDA' && selectedProduct
                  ? `Disponible ahora: ${selectedProduct.disponible} unidades`
                  : undefined
              }
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Motivo / Referencia Obligatoria *
              </label>
              <textarea
                required
                rows={2}
                placeholder="Ej. Venta en mostrador / Devolución cliente / Traslado por reposición"
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
