'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  Receipt,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  Package,
  Clock,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { KpiCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KpiSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { BannerError } from '@/components/ui/BannerError';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { formatCOP, formatDate } from '@/lib/format';

export default function DashboardPage() {
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  // 1. Resumen global (Solo Admin - Usuario da 403)
  const {
    data: resumen,
    isLoading: loadingResumen,
    error: errorResumen,
    refetch: refetchResumen,
  } = useQuery({
    queryKey: ['dashboard-resumen'],
    queryFn: () => api<any>('/dashboard/resumen'),
    enabled: isAdmin,
  });

  // 2. Alertas de stock mínimo (Ambos roles)
  const {
    data: alertasStock = [],
    isLoading: loadingAlertas,
    refetch: refetchAlertas,
  } = useQuery({
    queryKey: ['inventario-alertas'],
    queryFn: () => api<any[]>('/inventario/alertas-stock'),
  });

  // 3. Cartera por vencimiento (Admin)
  const { data: cartera, isLoading: loadingCartera } = useQuery({
    queryKey: ['reportes-cartera'],
    queryFn: () => api<any>('/reportes/cartera'),
    enabled: isAdmin,
  });

  // 4. CxP próximas a vencer (Admin)
  const { data: cxpProximas = [] } = useQuery({
    queryKey: ['cxp-proximas'],
    queryFn: () => api<any[]>('/cuentas-por-pagar/proximas-vencer?dias=15'),
    enabled: isAdmin,
  });

  // 5. Auditoría reciente (Admin)
  const { data: auditoria } = useQuery({
    queryKey: ['auditoria-reciente'],
    queryFn: () => api<any>('/auditoria?limit=5'),
    enabled: isAdmin,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Top Header & Acciones Rápidas */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Panel de Control</h1>
            <p className="text-xs text-[#64748b]">
              Bienvenido, <span className="font-semibold text-[#0f172a]">{user?.email}</span> (
              {isAdmin ? 'Administrador General' : 'Operador de Mostrador'})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/facturacion/nueva">
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
                Nueva Remisión
              </Button>
            </Link>
            <Link href="/contabilidad/cartera">
              <Button size="sm" variant="outline" icon={<CreditCard className="w-3.5 h-3.5" />}>
                Registrar Pago
              </Button>
            </Link>
            <Link href="/inventario">
              <Button size="sm" variant="outline" icon={<Package className="w-3.5 h-3.5" />}>
                Movimiento Inventario
              </Button>
            </Link>
          </div>
        </div>

        {/* Error / Fallo en Dashboard (2.1E) */}
        {errorResumen && (
          <BannerError
            error={errorResumen}
            rceAction={{
              label: 'Reintentar consulta',
              onClick: () => {
                refetchResumen();
                refetchAlertas();
              },
            }}
          />
        )}

        {/* Grid de KPIs principales */}
        {isAdmin ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {loadingResumen ? (
              <>
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
              </>
            ) : (
              <>
                <KpiCard
                  title="Ventas del Periodo"
                  value={formatCOP(resumen?.totalVentas ?? 0)}
                  subtitle="Remisiones emitidas este mes"
                  icon={<TrendingUp className="w-5 h-5" />}
                  badge={<Badge variant="active">+12.4%</Badge>}
                />
                <KpiCard
                  title="Cuentas por Cobrar"
                  value={formatCOP(resumen?.totalCuentasPorCobrar ?? resumen?.totalCartera ?? 0)}
                  subtitle="Saldo pendiente clientes"
                  icon={<Receipt className="w-5 h-5" />}
                  badge={<Badge variant="pending">En seguimiento</Badge>}
                />
                <KpiCard
                  title="Cuentas por Pagar"
                  value={formatCOP(resumen?.totalCuentasPorPagar ?? 0)}
                  subtitle="Pendiente a proveedores"
                  icon={<CreditCard className="w-5 h-5" />}
                />
                <KpiCard
                  title="Referencias en Alerta"
                  value={alertasStock.length}
                  subtitle="Bajo stock de seguridad"
                  icon={<AlertTriangle className="w-5 h-5 text-[#f59e0b]" />}
                  badge={
                    alertasStock.length > 0 ? (
                      <Badge variant="error">{alertasStock.length} críticas</Badge>
                    ) : (
                      <Badge variant="active">Stock óptimo</Badge>
                    )
                  }
                />
              </>
            )}
          </div>
        ) : (
          /* Vista reducida para Usuario sin permisos financieros */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Inventario en Alerta
                </span>
                <div className="text-2xl font-bold text-[#0f172a] mt-2">
                  {alertasStock.length} repuestos
                </div>
                <p className="text-xs text-[#64748b] mt-1">Referencias con stock bajo mínimo</p>
              </div>
              <Link href="/inventario">
                <Button size="sm" variant="outline">
                  Ver inventario
                </Button>
              </Link>
            </div>

            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Acceso Rápido Ventas
                </span>
                <div className="text-base font-semibold text-[#0f172a] mt-2">
                  Generación de Remisiones
                </div>
                <p className="text-xs text-[#64748b] mt-1">Cotizaciones y pedidos de mostrador</p>
              </div>
              <Link href="/facturacion/nueva">
                <Button size="sm" variant="primary">
                  Nueva Venta
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Sección de Paneles y Listados */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel Izquierdo: Alertas de Stock Mínimo */}
          <div className="lg:col-span-2 bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#f59e0b]" />
                <h3 className="text-sm font-semibold text-[#0f172a]">
                  Alertas de Reposición de Inventario
                </h3>
              </div>
              <Link
                href="/inventario"
                className="text-xs text-[#1d63ed] font-medium hover:underline flex items-center gap-1"
              >
                Ver todo el catálogo <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="mt-4">
              {loadingAlertas ? (
                <TableSkeleton rows={4} cols={4} />
              ) : alertasStock.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#64748b]">
                  <p>No hay alertas de inventario. Todos los repuestos están por encima del stock mínimo.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Repuesto</th>
                        <th className="py-2.5 px-3 text-right">Disponible</th>
                        <th className="py-2.5 px-3 text-right">Mínimo</th>
                        <th className="py-2.5 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {alertasStock.slice(0, 5).map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="hover:bg-[#f8fafc]">
                          <td className="py-3 px-3 font-semibold text-[#0f172a]">{item.codigo}</td>
                          <td className="py-3 px-3 text-[#424655] truncate max-w-[200px]">
                            {item.nombre || item.descripcion}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-[#ef4444] tabular-nums">
                            {item.disponible ?? item.stockActual ?? 0}
                          </td>
                          <td className="py-3 px-3 text-right text-[#64748b] tabular-nums">
                            {item.stockMinimo ?? 0}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant="error">Bajo Mínimo</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Panel Derecho: Cartera por Vencimiento (Admin) */}
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#e2e8f0]">
                <h3 className="text-sm font-semibold text-[#0f172a]">Tramos de Cartera</h3>
                <Link
                  href="/contabilidad/cartera"
                  className="text-xs text-[#1d63ed] font-medium hover:underline"
                >
                  Gestionar
                </Link>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                {loadingCartera ? (
                  <TableSkeleton rows={4} cols={2} />
                ) : (
                  <>
                    <div className="flex justify-between items-center p-2.5 bg-[#f8fafc] rounded-md">
                      <span className="text-[#64748b]">Al día (0 - 30 días)</span>
                      <span className="font-semibold text-[#0f172a] tabular-nums">
                        {formatCOP(cartera?.totales?.alDia ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[#f8fafc] rounded-md">
                      <span className="text-[#64748b]">Mora 31 - 60 días</span>
                      <span className="font-semibold text-[#92400e] tabular-nums">
                        {formatCOP(cartera?.totales?.mora30 ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[#f8fafc] rounded-md">
                      <span className="text-[#64748b]">Mora 61 - 90 días</span>
                      <span className="font-semibold text-[#ef4444] tabular-nums">
                        {formatCOP(cartera?.totales?.mora60 ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-md">
                      <span className="text-[#991b1b] font-medium">Mayor a 90 días</span>
                      <span className="font-bold text-[#991b1b] tabular-nums">
                        {formatCOP(cartera?.totales?.mas90 ?? 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actividad / Auditoría al pie */}
            {isAdmin && auditoria && (
              <div className="mt-6 pt-4 border-t border-[#e2e8f0]">
                <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider block mb-2">
                  Última actividad del sistema
                </span>
                <div className="space-y-1.5 text-xs text-[#64748b]">
                  {auditoria.data?.slice(0, 2).map((ev: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 truncate">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ev.accion || ev.evento || 'Operación registrada'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
