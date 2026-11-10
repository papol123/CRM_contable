'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, TrendingDown, HandCoins, Truck, Search } from 'lucide-react';
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
import { formatCOP, formatDate } from '@/lib/format';
import { fechaLocalHoy } from '@/lib/cierre-diario';

type TipoPago = 'factura de venta' | 'factura de compra';
type Pestana = 'COBRAR' | 'PAGAR' | 'PAGOS' | 'GASTOS';

/** Documento con saldo pendiente (remisión por cobrar o factura de compra por pagar). */
interface Pendiente {
  id: string;
  numero: string;
  tercero: string;
  documento: string;
  fecha: string | null;
  vence: string | null;
  total: number;
  pagado: number;
  saldo: number;
  diasMora: number;
}

/** Lee todas las páginas de un listado (máx. 100 por página). */
async function todasLasPaginas<T>(ruta: string): Promise<T[]> {
  const filas: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const sep = ruta.includes('?') ? '&' : '?';
    const res = await api<any>(`${ruta}${sep}limit=100&page=${page}`);
    const lista: T[] = Array.isArray(res) ? res : res?.data || [];
    filas.push(...lista);
    if (Array.isArray(res) || page >= (res?.meta?.totalPages ?? 1)) break;
  }
  return filas;
}

function EstadoMora({ dias }: { dias: number }) {
  if (dias <= 0) return <Badge variant="active">Al día</Badge>;
  return <Badge variant={dias > 60 ? 'error' : 'pending'}>Vencida {dias} d</Badge>;
}

export default function CarteraPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [pestana, setPestana] = useState<Pestana>('COBRAR');
  const [filtro, setFiltro] = useState('');

  // Modal Registrar Pago
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [pagoTipo, setPagoTipo] = useState<TipoPago>('factura de venta');
  const [pagoIdFactura, setPagoIdFactura] = useState('');
  const [pagoIdMetodo, setPagoIdMetodo] = useState('');
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoFecha, setPagoFecha] = useState(fechaLocalHoy());
  const [pagoObservaciones, setPagoObservaciones] = useState('');
  const [pagoKey, setPagoKey] = useState(() => crypto.randomUUID());
  const [pagoError, setPagoError] = useState<ProblemDetails | null>(null);
  const [buscarDoc, setBuscarDoc] = useState('');

  // Modal Anular Pago
  const [isAnularPagoOpen, setIsAnularPagoOpen] = useState(false);
  const [selectedPago, setSelectedPago] = useState<any | null>(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [anularError, setAnularError] = useState<ProblemDetails | null>(null);

  // Modal Registrar Gasto
  const [isGastoModalOpen, setIsGastoModalOpen] = useState(false);
  const [gastoIdCat, setGastoIdCat] = useState('');
  const [gastoIdMetodo, setGastoIdMetodo] = useState('');
  const [gastoDesc, setGastoDesc] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoFecha, setGastoFecha] = useState(fechaLocalHoy());
  const [gastoError, setGastoError] = useState<ProblemDetails | null>(null);

  // ─── Catálogos ─────────────────────────────────────────────────────────────
  const { data: metodosPago = [] } = useQuery<any[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api<any[]>('/medios-pago'),
  });
  const { data: categoriasGasto = [] } = useQuery<any[]>({
    queryKey: ['categorias-gasto'],
    queryFn: () => api<any[]>('/categorias-gasto'),
  });
  const metodoEfectivo = metodosPago.find((m) => m.codigo === 'EFECTIVO')?.id || metodosPago[0]?.id || '';

  // ─── Cartera: por cobrar y por pagar ───────────────────────────────────────
  const porCobrar = useQuery<Pendiente[]>({
    queryKey: ['cuentas-por-cobrar'],
    queryFn: async () =>
      (await todasLasPaginas<any>('/cuentas-por-cobrar')).map((c) => ({
        id: c.idFactura,
        numero: c.numeroVenta,
        tercero: c.cliente,
        documento: c.documento,
        fecha: c.fechaExpedicion,
        vence: c.fechaVencimiento,
        total: Number(c.total),
        pagado: Number(c.pagado),
        saldo: Number(c.saldo),
        diasMora: Number(c.diasMora),
      })),
    retry: false,
  });
  const porPagar = useQuery<Pendiente[]>({
    queryKey: ['cuentas-por-pagar'],
    queryFn: async () =>
      (await todasLasPaginas<any>('/cuentas-por-pagar')).map((c) => ({
        id: c.idFacturaCompra,
        numero: c.numeroFactura || 'Sin número',
        tercero: c.proveedor,
        documento: c.documento,
        fecha: c.fechaEmision,
        vence: c.fechaVencimiento,
        total: Number(c.total),
        pagado: Number(c.pagado),
        saldo: Number(c.saldo),
        diasMora: Number(c.diasMora),
      })),
    retry: false,
  });

  // ─── Pagos y gastos ────────────────────────────────────────────────────────
  const { data: pagosData, isLoading: loadingPagos } = useQuery({
    queryKey: ['pagos'],
    queryFn: () => api<any>('/pagos?limit=100'),
  });
  const { data: gastosData, isLoading: loadingGastos } = useQuery({
    queryKey: ['gastos'],
    queryFn: () => api<any>('/gastos?limit=100'),
  });
  const pagosList: any[] = Array.isArray(pagosData) ? pagosData : pagosData?.data || [];
  const gastosList: any[] = Array.isArray(gastosData) ? gastosData : gastosData?.data || [];

  const refrescarCartera = () => {
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] });
    queryClient.invalidateQueries({ queryKey: ['cuentas-por-pagar'] });
  };

  // ─── Registrar pago ────────────────────────────────────────────────────────
  const pendientesDelTipo = (pagoTipo === 'factura de venta' ? porCobrar.data : porPagar.data) || [];
  const docSeleccionado = pendientesDelTipo.find((d) => d.id === pagoIdFactura) || null;

  const abrirPago = (tipo: TipoPago, doc?: Pendiente) => {
    setPagoTipo(tipo);
    setPagoIdFactura(doc?.id || '');
    setPagoMonto(doc ? String(doc.saldo) : '');
    setPagoIdMetodo(metodoEfectivo);
    setPagoFecha(fechaLocalHoy());
    setPagoObservaciones('');
    setBuscarDoc('');
    setPagoKey(crypto.randomUUID());
    setPagoError(null);
    setIsPagoModalOpen(true);
  };

  const pagoMutation = useMutation({
    mutationFn: () =>
      api('/pagos', {
        method: 'POST',
        headers: { 'Idempotency-Key': pagoKey },
        body: JSON.stringify({
          tipoPago: pagoTipo,
          idFactura: pagoIdFactura,
          idMetodoPago: pagoIdMetodo || metodoEfectivo,
          monto: parseFloat(pagoMonto),
          fechaPago: pagoFecha,
          observaciones: pagoObservaciones.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      success(
        pagoTipo === 'factura de venta' ? 'Abono registrado' : 'Pago a proveedor registrado',
        `Se aplicó ${formatCOP(parseFloat(pagoMonto))} a ${docSeleccionado?.numero ?? 'la factura'}.`,
      );
      setIsPagoModalOpen(false);
      refrescarCartera();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setPagoError(err.problem);
    },
  });

  // ─── Anular pago ───────────────────────────────────────────────────────────
  const anularPagoMutation = useMutation({
    mutationFn: () =>
      api(`/pagos/${selectedPago.id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: anularMotivo.trim() }),
      }),
    onSuccess: () => {
      success('Pago anulado', 'El saldo pendiente de la factura se reabrió.');
      setIsAnularPagoOpen(false);
      setAnularMotivo('');
      setAnularError(null);
      refrescarCartera();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setAnularError(err.problem);
    },
  });

  // ─── Registrar gasto ───────────────────────────────────────────────────────
  const gastoMutation = useMutation({
    mutationFn: () =>
      api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          idCategoriaGasto: gastoIdCat || categoriasGasto[0]?.id,
          idMetodoPago: gastoIdMetodo || undefined,
          descripcion: gastoDesc.trim(),
          monto: parseFloat(gastoMonto),
          fecha: gastoFecha,
        }),
      }),
    onSuccess: () => {
      success('Gasto registrado', 'El gasto quedó contabilizado.');
      setIsGastoModalOpen(false);
      setGastoDesc('');
      setGastoMonto('');
      setGastoError(null);
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setGastoError(err.problem);
    },
  });

  // ─── Filtro de texto en las tablas ─────────────────────────────────────────
  const coincide = (...campos: (string | null | undefined)[]) => {
    const f = filtro.trim().toLowerCase();
    return !f || campos.some((c) => c?.toLowerCase().includes(f));
  };
  const cobrarFiltrado = useMemo(
    () => (porCobrar.data || []).filter((d) => coincide(d.numero, d.tercero, d.documento)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porCobrar.data, filtro],
  );
  const pagarFiltrado = useMemo(
    () => (porPagar.data || []).filter((d) => coincide(d.numero, d.tercero, d.documento)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porPagar.data, filtro],
  );
  const suma = (lista: Pendiente[] = [], campo: 'saldo' = 'saldo') => lista.reduce((a, d) => a + d[campo], 0);
  const vencido = (lista: Pendiente[] = []) => lista.filter((d) => d.diasMora > 0).reduce((a, d) => a + d.saldo, 0);

  const docsModal = pendientesDelTipo.filter((d) => {
    const f = buscarDoc.trim().toLowerCase();
    return !f || d.numero.toLowerCase().includes(f) || d.tercero.toLowerCase().includes(f);
  });

  const pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'COBRAR', titulo: `Por cobrar (clientes)${porCobrar.data ? ` · ${porCobrar.data.length}` : ''}` },
    { id: 'PAGAR', titulo: `Por pagar (proveedores)${porPagar.data ? ` · ${porPagar.data.length}` : ''}` },
    { id: 'PAGOS', titulo: 'Pagos registrados' },
    { id: 'GASTOS', titulo: 'Gastos' },
  ];

  const TablaPendientes = ({
    consulta,
    filas,
    tipo,
  }: {
    consulta: typeof porCobrar;
    filas: Pendiente[];
    tipo: TipoPago;
  }) => {
    const esVenta = tipo === 'factura de venta';
    if (consulta.isLoading) return <div className="p-4"><TableSkeleton rows={5} cols={7} /></div>;
    if (consulta.error) {
      return (
        <div className="p-6 text-xs text-[#64748b]">
          {(consulta.error as any)?.problem?.status === 403
            ? 'No tienes permiso para ver la cartera completa. Pide acceso a un administrador.'
            : `No se pudo cargar: ${(consulta.error as Error).message}`}
        </div>
      );
    }
    if (filas.length === 0) {
      return (
        <EmptyState
          icon={esVenta ? <HandCoins className="w-8 h-8" /> : <Truck className="w-8 h-8" />}
          title={filtro ? 'Sin resultados' : esVenta ? 'Ningún cliente debe dinero' : 'No hay deudas con proveedores'}
          description={filtro ? 'Prueba con otro número, nombre o documento.' : 'Todas las facturas están pagadas.'}
        />
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-4">{esVenta ? 'N° Remisión' : 'N° Factura'}</th>
              <th className="py-3 px-4">{esVenta ? 'Cliente' : 'Proveedor'}</th>
              <th className="py-3 px-4">Fecha</th>
              <th className="py-3 px-4">Vence</th>
              <th className="py-3 px-4 text-right">Total</th>
              <th className="py-3 px-4 text-right">{esVenta ? 'Abonado' : 'Pagado'}</th>
              <th className="py-3 px-4 text-right">Saldo</th>
              <th className="py-3 px-4 text-center">Estado</th>
              <th className="py-3 px-4 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0]">
            {filas.map((d) => (
              <tr key={d.id} className="hover:bg-[#f8fafc]">
                <td className="py-3 px-4 font-semibold text-[#0f172a]">{d.numero}</td>
                <td className="py-3 px-4">
                  <span className="block text-[#0f172a]">{d.tercero}</span>
                  <span className="text-[11px] text-[#94a3b8]">{d.documento}</span>
                </td>
                <td className="py-3 px-4 text-[#64748b]">{formatDate(d.fecha)}</td>
                <td className="py-3 px-4 text-[#64748b]">{formatDate(d.vence)}</td>
                <td className="py-3 px-4 text-right tabular-nums">{formatCOP(d.total)}</td>
                <td className="py-3 px-4 text-right tabular-nums text-[#64748b]">{formatCOP(d.pagado)}</td>
                <td className="py-3 px-4 text-right tabular-nums font-bold text-[#0f172a]">{formatCOP(d.saldo)}</td>
                <td className="py-3 px-4 text-center"><EstadoMora dias={d.diasMora} /></td>
                <td className="py-3 px-4 text-right">
                  {can('pagos.registrar') && (
                    <Button size="sm" variant="outline" onClick={() => abrirPago(tipo, d)}>
                      {esVenta ? 'Abonar' : 'Pagar'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Cartera y Pagos</h1>
            <p className="text-xs text-[#64748b]">Lo que te deben los clientes, lo que debes a proveedores y los pagos registrados</p>
          </div>
          <div className="flex items-center gap-3">
            {can('pagos.registrar') && (
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => abrirPago(pestana === 'PAGAR' ? 'factura de compra' : 'factura de venta')}>
                Registrar Pago
              </Button>
            )}
            {can('gastos.registrar') && (
              <Button
                variant="outline"
                icon={<TrendingDown className="w-4 h-4" />}
                onClick={() => {
                  setGastoError(null);
                  setGastoFecha(fechaLocalHoy());
                  setIsGastoModalOpen(true);
                }}
              >
                Registrar Gasto
              </Button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Resumen titulo="Te deben (clientes)" valor={suma(porCobrar.data)} detalle={`${porCobrar.data?.length ?? 0} remisiones con saldo`} />
          <Resumen titulo="Vencido por cobrar" valor={vencido(porCobrar.data)} detalle="Ya pasó la fecha de pago" alerta />
          <Resumen titulo="Debes (proveedores)" valor={suma(porPagar.data)} detalle={`${porPagar.data?.length ?? 0} facturas con saldo`} />
          <Resumen titulo="Vencido por pagar" valor={vencido(porPagar.data)} detalle="Ya pasó la fecha de pago" alerta />
        </div>

        {/* Pestañas */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#e2e8f0]">
          <div className="flex text-xs font-semibold gap-6 overflow-x-auto">
            {pestanas.map((p) => (
              <button
                key={p.id}
                onClick={() => setPestana(p.id)}
                className={`pb-3 border-b-2 whitespace-nowrap transition-colors ${
                  pestana === p.id ? 'border-[#1d63ed] text-[#1d63ed]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                {p.titulo}
              </button>
            ))}
          </div>
          {(pestana === 'COBRAR' || pestana === 'PAGAR') && (
            <div className="pb-2 w-full sm:w-72">
              <Input
                placeholder="Buscar por número, nombre o NIT..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          )}
        </div>

        {pestana === 'COBRAR' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            <TablaPendientes consulta={porCobrar} filas={cobrarFiltrado} tipo="factura de venta" />
          </div>
        )}

        {pestana === 'PAGAR' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            <TablaPendientes consulta={porPagar} filas={pagarFiltrado} tipo="factura de compra" />
          </div>
        )}

        {/* Pagos registrados */}
        {pestana === 'PAGOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingPagos ? (
              <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
            ) : pagosList.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="w-8 h-8" />}
                title="No hay pagos registrados"
                description="Registra un abono de un cliente o un pago a proveedor."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Documento</th>
                      <th className="py-3 px-4">Cliente / Proveedor</th>
                      <th className="py-3 px-4">Medio</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {pagosList.map((p: any) => {
                      const anulado = p.estado?.codigo === 'ANULADO';
                      const docs: any[] = p.documentos || [];
                      return (
                        <tr key={p.id} className={`hover:bg-[#f8fafc] ${anulado ? 'opacity-60' : ''}`}>
                          <td className="py-3 px-4 text-[#64748b] whitespace-nowrap">{formatDate(p.fechaPago)}</td>
                          <td className="py-3 px-4 font-medium text-[#0f172a] whitespace-nowrap">
                            {p.tipoPago === 'factura de venta' ? 'Cobro a cliente' : 'Pago a proveedor'}
                          </td>
                          <td className="py-3 px-4">
                            {docs.length === 0 ? (
                              <span className="text-[#94a3b8]">Sin documento</span>
                            ) : (
                              docs.map((d) => (
                                <span key={d.idFactura} className="block">
                                  <span className="font-semibold text-[#0f172a]">{d.numero || 'Sin número'}</span>
                                  <span className="text-[11px] text-[#94a3b8]"> · {formatDate(d.fecha)}</span>
                                </span>
                              ))
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#334155]">{p.tercero?.razonSocial || '—'}</td>
                          <td className="py-3 px-4 text-[#64748b]">{p.metodoPago?.nombre || '—'}</td>
                          <td className="py-3 px-4 text-right font-bold text-[#0f172a] tabular-nums">{formatCOP(p.monto)}</td>
                          <td className="py-3 px-4 text-center">
                            {anulado ? <Badge variant="error">Anulado</Badge> : <Badge variant="active">Aplicado</Badge>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isAdmin && !anulado && can('pagos.anular') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedPago(p);
                                  setAnularError(null);
                                  setAnularMotivo('');
                                  setIsAnularPagoOpen(true);
                                }}
                              >
                                Anular
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
        )}

        {/* Gastos */}
        {pestana === 'GASTOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingGastos ? (
              <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
            ) : gastosList.length === 0 ? (
              <EmptyState
                icon={<TrendingDown className="w-8 h-8" />}
                title="No hay gastos registrados"
                description="Registra gastos de energía, arriendo, nómina o servicios."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Descripción</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4">Medio</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {gastosList.map((g: any) => (
                      <tr key={g.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3 px-4 text-[#64748b] whitespace-nowrap">{formatDate(g.fecha)}</td>
                        <td className="py-3 px-4 font-medium text-[#0f172a]">{g.descripcion}</td>
                        <td className="py-3 px-4 text-[#64748b]">{g.categoria?.nombre || '—'}</td>
                        <td className="py-3 px-4 text-[#64748b]">{g.metodoPago?.nombre || '—'}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#ef4444] tabular-nums">{formatCOP(g.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal: Registrar Pago */}
        <Modal
          isOpen={isPagoModalOpen}
          onClose={() => setIsPagoModalOpen(false)}
          title={pagoTipo === 'factura de venta' ? 'Registrar abono de cliente' : 'Registrar pago a proveedor'}
          subtitle="Se aplica al saldo de la factura elegida"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsPagoModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={pagoMutation.isPending}
                disabled={!pagoIdFactura || !(parseFloat(pagoMonto) > 0)}
                onClick={() => pagoMutation.mutate()}
              >
                Registrar
              </Button>
            </div>
          }
        >
          {pagoError && <BannerError error={pagoError} status={pagoError.status} />}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['factura de venta', 'factura de compra'] as TipoPago[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPagoTipo(t);
                    setPagoIdFactura('');
                    setPagoMonto('');
                  }}
                  className={`py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                    pagoTipo === t ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]' : 'bg-white border-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  {t === 'factura de venta' ? 'Cobro a cliente' : 'Pago a proveedor'}
                </button>
              ))}
            </div>

            {docSeleccionado ? (
              <div className="p-3 rounded-lg border border-[#1d63ed] bg-[#eff4ff] text-xs flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#0f172a]">{docSeleccionado.numero} · {docSeleccionado.tercero}</p>
                  <p className="text-[#64748b]">
                    Fecha {formatDate(docSeleccionado.fecha)} · Total {formatCOP(docSeleccionado.total)}
                  </p>
                  <p className="font-semibold text-[#0f172a]">Saldo pendiente: {formatCOP(docSeleccionado.saldo)}</p>
                </div>
                <button type="button" className="text-[#1d63ed] hover:underline" onClick={() => setPagoIdFactura('')}>
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  {pagoTipo === 'factura de venta' ? 'Remisión a abonar *' : 'Factura de compra a pagar *'}
                </label>
                <Input
                  placeholder="Buscar por número o nombre..."
                  value={buscarDoc}
                  onChange={(e) => setBuscarDoc(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                />
                <div className="border border-[#e2e8f0] rounded-md max-h-56 overflow-y-auto divide-y divide-[#f1f5f9]">
                  {docsModal.length === 0 ? (
                    <p className="p-3 text-xs text-[#64748b]">No hay facturas con saldo pendiente.</p>
                  ) : (
                    docsModal.slice(0, 50).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setPagoIdFactura(d.id);
                          setPagoMonto(String(d.saldo));
                        }}
                        className="w-full text-left p-2.5 text-xs hover:bg-[#eff4ff] flex justify-between gap-3"
                      >
                        <span>
                          <span className="font-semibold text-[#0f172a]">{d.numero}</span>
                          <span className="text-[#64748b]"> · {d.tercero} · {formatDate(d.fecha)}</span>
                        </span>
                        <span className="font-semibold tabular-nums whitespace-nowrap">{formatCOP(d.saldo)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Monto (COP) *"
                type="number"
                min={0}
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                helperText={docSeleccionado ? `Máximo ${formatCOP(docSeleccionado.saldo)}` : undefined}
              />
              <Input label="Fecha del pago *" type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Medio de pago *</label>
              <select
                value={pagoIdMetodo || metodoEfectivo}
                onChange={(e) => setPagoIdMetodo(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
              >
                {metodosPago.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    {mp.nombre}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Observaciones"
              placeholder="Ej. Transferencia Bancolombia ref. 998877"
              value={pagoObservaciones}
              onChange={(e) => setPagoObservaciones(e.target.value)}
            />
          </div>
        </Modal>

        {/* Modal: Anular Pago */}
        <Modal
          isOpen={isAnularPagoOpen}
          onClose={() => setIsAnularPagoOpen(false)}
          title="Anular pago"
          subtitle={
            selectedPago
              ? `${formatCOP(selectedPago.monto)} del ${formatDate(selectedPago.fechaPago)} · ${
                  (selectedPago.documentos || []).map((d: any) => d.numero).join(', ') || 'sin documento'
                }`
              : undefined
          }
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsAnularPagoOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                isLoading={anularPagoMutation.isPending}
                disabled={!anularMotivo.trim()}
                onClick={() => anularPagoMutation.mutate()}
              >
                Confirmar anulación
              </Button>
            </div>
          }
        >
          {anularError && <BannerError error={anularError} status={anularError.status} />}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Motivo *</label>
            <textarea
              rows={3}
              placeholder="Ej. Pago duplicado / Cheque devuelto por el banco"
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
            />
            <p className="text-[11px] text-[#64748b]">El saldo de la factura vuelve a quedar pendiente.</p>
          </div>
        </Modal>

        {/* Modal: Registrar Gasto */}
        <Modal
          isOpen={isGastoModalOpen}
          onClose={() => setIsGastoModalOpen(false)}
          title="Registrar gasto"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsGastoModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={gastoMutation.isPending}
                disabled={!gastoDesc.trim() || !(parseFloat(gastoMonto) > 0)}
                onClick={() => gastoMutation.mutate()}
              >
                Guardar gasto
              </Button>
            </div>
          }
        >
          {gastoError && <BannerError error={gastoError} status={gastoError.status} />}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Categoría *</label>
                <select
                  value={gastoIdCat}
                  onChange={(e) => setGastoIdCat(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  {categoriasGasto.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Medio de pago</label>
                <select
                  value={gastoIdMetodo}
                  onChange={(e) => setGastoIdMetodo(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  <option value="">Sin especificar</option>
                  {metodosPago.map((mp) => (
                    <option key={mp.id} value={mp.id}>
                      {mp.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Input
              label="Descripción *"
              placeholder="Ej. Servicio de energía sede principal - octubre"
              value={gastoDesc}
              onChange={(e) => setGastoDesc(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Monto (COP) *" type="number" min={0} value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} />
              <Input
                label="Fecha *"
                type="date"
                value={gastoFecha}
                onChange={(e) => setGastoFecha(e.target.value)}
                helperText="Debe estar en un mes abierto"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}

function Resumen({ titulo, valor, detalle, alerta }: { titulo: string; valor: number; detalle: string; alerta?: boolean }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card">
      <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 ${alerta && valor > 0 ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
        {formatCOP(valor)}
      </p>
      <p className="text-[11px] text-[#64748b]">{detalle}</p>
    </div>
  );
}
