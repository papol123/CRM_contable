'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserRound, Zap, FilePlus2, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ModalAbono, DocumentoPorCobrar } from '@/components/cartera/ModalAbono';
import { ModalRemisionRapida } from '@/components/ventas/ModalRemisionRapida';
import { api } from '@/lib/api';
import { can } from '@/lib/auth';
import { formatCOP, formatDate } from '@/lib/format';

const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';

interface Factura {
  id: string;
  numero: string;
  numeroRemision: string;
  cliente: string;
  documento: string;
  nombreDeudor: string | null;
  observaciones: string | null;
  fecha: string | null;
  vence: string | null;
  total: number;
  pagado: number;
  saldo: number;
  diasMora: number;
}

interface Deudor {
  clave: string;
  nombre: string;
  detalle: string;
  facturas: Factura[];
  saldo: number;
  vencido: number;
  maxMora: number;
}

async function todasLasPaginas(ruta: string): Promise<any[]> {
  const filas: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await api<any>(`${ruta}?limit=100&page=${page}`);
    filas.push(...(res?.data || []));
    if (page >= (res?.meta?.totalPages ?? 1)) break;
  }
  return filas;
}

export default function DeudoresPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const [filtro, setFiltro] = useState('');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [abonar, setAbonar] = useState<DocumentoPorCobrar | null>(null);
  const [rapidaAbierta, setRapidaAbierta] = useState(false);

  const { data: facturas, isLoading, error } = useQuery<Factura[]>({
    queryKey: ['cuentas-por-cobrar'],
    queryFn: async () =>
      (await todasLasPaginas('/cuentas-por-cobrar')).map((c) => ({
        id: c.idFactura,
        numero: c.numeroExterno ? `N° ${c.numeroExterno}` : c.numeroVenta,
        numeroRemision: c.numeroVenta,
        cliente: c.cliente,
        documento: c.documento,
        nombreDeudor: c.nombreDeudor,
        observaciones: c.observaciones,
        fecha: c.fechaExpedicion,
        vence: c.fechaVencimiento,
        total: Number(c.total),
        pagado: Number(c.pagado),
        saldo: Number(c.saldo),
        diasMora: Number(c.diasMora),
      })),
    retry: false,
  });

  // Agrupa por deudor: el cliente, o la persona anotada cuando el crédito es a Consumidor final
  const deudores = useMemo<Deudor[]>(() => {
    const mapa = new Map<string, Deudor>();
    for (const f of facturas || []) {
      const esCF = f.documento === DOCUMENTO_CONSUMIDOR_FINAL;
      const nombre = esCF ? f.nombreDeudor || 'Consumidor final (sin nombre)' : f.cliente;
      const clave = esCF ? `cf:${(f.nombreDeudor || '').trim().toLowerCase()}` : `c:${f.cliente}|${f.documento}`;
      const d =
        mapa.get(clave) ||
        ({
          clave,
          nombre,
          detalle: esCF ? 'Consumidor final' : `NIT/CC ${f.documento}`,
          facturas: [],
          saldo: 0,
          vencido: 0,
          maxMora: 0,
        } as Deudor);
      d.facturas.push(f);
      d.saldo += f.saldo;
      if (f.diasMora > 0) d.vencido += f.saldo;
      d.maxMora = Math.max(d.maxMora, f.diasMora);
      mapa.set(clave, d);
    }
    const t = filtro.trim().toLowerCase();
    return Array.from(mapa.values())
      .filter((d) => !soloVencidos || d.vencido > 0)
      .filter(
        (d) =>
          !t ||
          d.nombre.toLowerCase().includes(t) ||
          d.detalle.toLowerCase().includes(t) ||
          d.facturas.some((f) => f.numero.toLowerCase().includes(t) || f.numeroRemision.toLowerCase().includes(t)),
      )
      .sort((a, b) => b.saldo - a.saldo);
  }, [facturas, filtro, soloVencidos]);

  const totalDeuda = (facturas || []).reduce((a, f) => a + f.saldo, 0);
  const totalVencido = (facturas || []).filter((f) => f.diasMora > 0).reduce((a, f) => a + f.saldo, 0);
  const cantidadDeudores = useMemo(() => {
    const claves = new Set(
      (facturas || []).map((f) =>
        f.documento === DOCUMENTO_CONSUMIDOR_FINAL ? `cf:${(f.nombreDeudor || '').toLowerCase()}` : `c:${f.documento}`,
      ),
    );
    return claves.size;
  }, [facturas]);

  const alternar = (clave: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] });
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Deudores</h1>
            <p className="text-xs text-[#64748b]">Quién nos debe, cuánto y desde cuándo. Las ventas a crédito aparecen aquí solas.</p>
          </div>
          <div className="flex items-center gap-2">
            {can('ventas.crear') && (
              <>
                <Button variant="outline" icon={<Zap className="w-4 h-4" />} onClick={() => setRapidaAbierta(true)}>
                  Fiar (remisión rápida)
                </Button>
                <Link href="/facturacion/nueva">
                  <Button variant="outline" icon={<FilePlus2 className="w-4 h-4" />}>
                    Nueva remisión
                  </Button>
                </Link>
              </>
            )}
            <Button variant="ghost" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </div>

        <h1 className="hidden print:block text-lg font-bold">Listado de deudores — {new Date().toLocaleDateString('es-CO')}</h1>

        {/* Resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card print:shadow-none">
            <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Nos deben en total</p>
            <p className="text-2xl font-bold tabular-nums text-[#0f172a]">{formatCOP(totalDeuda)}</p>
            <p className="text-[11px] text-[#64748b]">{facturas?.length ?? 0} facturas pendientes</p>
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card print:shadow-none">
            <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Vencido</p>
            <p className={`text-2xl font-bold tabular-nums ${totalVencido > 0 ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
              {formatCOP(totalVencido)}
            </p>
            <p className="text-[11px] text-[#64748b]">Ya pasó la fecha acordada de pago</p>
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card print:shadow-none">
            <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Deudores</p>
            <p className="text-2xl font-bold tabular-nums text-[#0f172a]">{cantidadDeudores}</p>
            <p className="text-[11px] text-[#64748b]">Clientes y personas con saldo</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center print:hidden">
          <div className="sm:w-96">
            <Input
              placeholder="Buscar por nombre, NIT o número de factura..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#334155] cursor-pointer">
            <input type="checkbox" checked={soloVencidos} onChange={(e) => setSoloVencidos(e.target.checked)} />
            Solo deudas vencidas
          </label>
        </div>

        {/* Lista */}
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : error ? (
          <div className="p-6 bg-white border border-[#e2e8f0] rounded-lg text-xs text-[#64748b]">
            {(error as any)?.problem?.status === 403
              ? 'No tienes permiso para ver todos los deudores. Pide acceso a un administrador.'
              : `No se pudo cargar: ${(error as Error).message}`}
          </div>
        ) : deudores.length === 0 ? (
          <div className="bg-white border border-[#e2e8f0] rounded-lg">
            <EmptyState
              icon={<UserRound className="w-8 h-8" />}
              title={filtro || soloVencidos ? 'Sin resultados' : 'Nadie nos debe'}
              description={filtro || soloVencidos ? 'Prueba con otra búsqueda.' : 'Cuando emitas una remisión a crédito aparecerá aquí.'}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {deudores.map((d) => {
              const abierto = abiertos.has(d.clave) || !!filtro;
              return (
                <div key={d.clave} className="bg-white border border-[#e2e8f0] rounded-xl shadow-card overflow-hidden print:shadow-none break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => alternar(d.clave)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[#f8fafc]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="print:hidden text-[#64748b]">
                        {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#0f172a] truncate">{d.nombre}</p>
                        <p className="text-[11px] text-[#64748b]">
                          {d.detalle} · {d.facturas.length} factura{d.facturas.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {d.maxMora > 0 ? (
                        <Badge variant={d.maxMora > 60 ? 'error' : 'pending'}>Vencida hace {d.maxMora} d</Badge>
                      ) : (
                        <Badge variant="active">Al día</Badge>
                      )}
                      <span className="text-base font-bold tabular-nums text-[#0f172a]">{formatCOP(d.saldo)}</span>
                    </div>
                  </button>

                  <div className={abierto ? 'border-t border-[#e2e8f0] overflow-x-auto' : 'hidden print:block border-t border-[#e2e8f0]'}>
                    <table className="w-full text-xs">
                      <thead className="bg-[#f8fafc] text-[#64748b] uppercase tracking-wider">
                        <tr>
                          <th className="text-left py-2 px-4">Factura</th>
                          <th className="text-left py-2 px-4">Fecha</th>
                          <th className="text-left py-2 px-4">Vence</th>
                          <th className="text-right py-2 px-4">Total</th>
                          <th className="text-right py-2 px-4">Abonado</th>
                          <th className="text-right py-2 px-4">Debe</th>
                          <th className="py-2 px-4 print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1f5f9]">
                        {d.facturas.map((f) => (
                          <tr key={f.id}>
                            <td className="py-2 px-4">
                              <span className="font-semibold text-[#0f172a]">{f.numero}</span>
                              {f.numero !== f.numeroRemision && (
                                <span className="text-[11px] text-[#94a3b8]"> ({f.numeroRemision})</span>
                              )}
                              {f.observaciones && <span className="block text-[11px] text-[#64748b]">{f.observaciones}</span>}
                            </td>
                            <td className="py-2 px-4 text-[#64748b]">{formatDate(f.fecha)}</td>
                            <td className="py-2 px-4">
                              <span className={f.diasMora > 0 ? 'text-[#dc2626] font-semibold' : 'text-[#64748b]'}>
                                {formatDate(f.vence)}
                                {f.diasMora > 0 && ` · ${f.diasMora} d`}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">{formatCOP(f.total)}</td>
                            <td className="py-2 px-4 text-right tabular-nums text-[#64748b]">{formatCOP(f.pagado)}</td>
                            <td className="py-2 px-4 text-right tabular-nums font-bold">{formatCOP(f.saldo)}</td>
                            <td className="py-2 px-4 text-right print:hidden">
                              {can('pagos.registrar') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setAbonar({ id: f.id, numero: f.numero, deudor: d.nombre, fecha: f.fecha, total: f.total, saldo: f.saldo })
                                  }
                                >
                                  Abonar
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ModalAbono
          documento={abonar}
          onClose={() => setAbonar(null)}
          onRegistrado={(monto) => {
            success('Abono registrado', `${formatCOP(monto)} abonados a ${abonar?.numero} de ${abonar?.deudor}.`);
            setAbonar(null);
            refrescar();
          }}
        />

        <ModalRemisionRapida
          isOpen={rapidaAbierta}
          creditoInicial
          onClose={() => setRapidaAbierta(false)}
          onCreada={(r) => {
            success(
              'Remisión registrada',
              `Factura N° ${r.numeroExterno} (${r.numeroVenta}) por ${formatCOP(r.total)}${r.saldo > 0 ? ' quedó en Deudores' : ' de contado'}.`,
            );
            setRapidaAbierta(false);
            refrescar();
          }}
        />
      </div>
    </AppLayout>
  );
}
