'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Receipt,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  Printer,
  Clock,
  Building,
  FileText,
  User,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatCOP } from '@/lib/format';
import { esFechaValida, fechaLocalHoy, rutaDesdeCierre } from '@/lib/cierre-diario';

interface RemisionItem {
  id: string;
  numero: string;
  cliente: string;
  total: number;
  pagada: boolean;
  medioPago?: string;
  observaciones?: string;
  esManual?: boolean;
}

interface GastoItem {
  id: string;
  concepto: string;
  categoria: string;
  monto: number;
  medioPago: string;
  beneficiario?: string;
  esManual?: boolean;
}

interface CompraItem {
  id: string;
  proveedor: string;
  numeroFactura: string;
  monto: number;
  pagada: boolean;
  medioPago?: string;
  esManual?: boolean;
}

/** Cierre guardado tal como lo devuelve GET /cierres-diarios/resumen. */
interface CierreDiarioRecord {
  id: string;
  fecha: string;
  facturadoDiaAnterior: number;
  totalVentas: number;
  ventasCobradas: number;
  ventasCredito: number;
  totalGastos: number;
  totalComprasPagadas: number;
  saldoEsperado: number;
  efectivoReal: number;
  diferencia: number;
  observaciones: string;
  cerradoPor: { id: string; email: string; nombre?: string } | null;
  creadoEn: string;
  actualizadoEn: string;
}

interface ResumenCierreDiario {
  fecha: string;
  remisiones: { id: string; numero: string; cliente: string; total: number; pagada: boolean }[];
  gastos: { id: string; concepto: string; categoria: string; monto: number; medioPago: string }[];
  compras: { id: string; proveedor: string; numeroFactura: string; monto: number; pagada: boolean }[];
  manuales: {
    remisiones: Omit<RemisionItem, 'esManual'>[];
    gastos: Omit<GastoItem, 'esManual'>[];
    compras: Omit<CompraItem, 'esManual'>[];
  };
  cierre: CierreDiarioRecord | null;
}

const MEDIOS_VALIDOS = ['EFECTIVO', 'TRANSFERENCIA', 'DATAFONO', 'OTRO'];
const medioValido = (m?: string) => (m && MEDIOS_VALIDOS.includes(m) ? m : undefined);

export default function CierreDiarioPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Fecha del cierre (por defecto hoy en YYYY-MM-DD)
  const hoyStr = fechaLocalHoy();
  const [fechaCierre, setFechaCierre] = useState(hoyStr);

  // 1. Facturado día anterior (Siigo / externo)
  const [facturadoDiaAnterior, setFacturadoDiaAnterior] = useState<number>(0);

  // 2. Remisiones del día (se emiten en el formulario real de remisión)
  const [remisiones, setRemisiones] = useState<RemisionItem[]>([]);

  // 3. Gastos del día (se registran como gastos reales del sistema)
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [isModalGastoOpen, setIsModalGastoOpen] = useState(false);
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoCategoria, setGastoCategoria] = useState('');
  const [gastoMonto, setGastoMonto] = useState<number>(0);
  const [gastoMedio, setGastoMedio] = useState<string>('');
  const [gastoBeneficiario, setGastoBeneficiario] = useState('');

  // 4. Compras del día (se registran en el formulario real de compra)
  const [compras, setCompras] = useState<CompraItem[]>([]);

  // Catálogos para el gasto real
  const { data: categoriasGasto = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['categorias-gasto'],
    queryFn: () => api('/categorias-gasto'),
    staleTime: 5 * 60_000,
  });
  const { data: mediosPago = [] } = useQuery<{ id: string; codigo: string; nombre: string }[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api('/medios-pago'),
    staleTime: 5 * 60_000,
  });

  // Abrir el día indicado en la URL (?fecha=YYYY-MM-DD), p. ej. al volver de una remisión o compra
  useEffect(() => {
    const fecha = new URLSearchParams(window.location.search).get('fecha');
    if (esFechaValida(fecha)) setFechaCierre(fecha);
  }, []);

  // 5. Arqueo y cierre
  const [efectivoReal, setEfectivoReal] = useState<number>(0);
  const [cierreObservaciones, setCierreObservaciones] = useState('');
  const [cierreGuardado, setCierreGuardado] = useState<CierreDiarioRecord | null>(null);

  // Cargar datos del sistema para la fecha seleccionada
  // Ventas, gastos y compras del día (todos los usuarios) + el cierre guardado en el servidor
  const {
    data: resumen,
    isLoading: cargandoResumen,
    error: errorResumen,
  } = useQuery<ResumenCierreDiario>({
    queryKey: ['cierre-diario', fechaCierre],
    queryFn: () => api<ResumenCierreDiario>(`/cierres-diarios/resumen?fecha=${fechaCierre}`),
  });

  // Al llegar el resumen: cargar los datos del sistema, los ítems manuales y el arqueo guardado.
  // Si solo se recargó el mismo día (p. ej. tras registrar un gasto), se conserva lo que el
  // usuario ya digitó en el arqueo y los cambios de cobro de las remisiones.
  const fechaCargada = useRef<string | null>(null);
  useEffect(() => {
    if (!resumen) return;
    const mismoDia = fechaCargada.current === resumen.fecha;
    fechaCargada.current = resumen.fecha;

    setRemisiones((prev) => {
      const cobroPrevio = new Map(prev.map((r) => [r.id, r.pagada]));
      return [
        ...resumen.remisiones.map((r) => {
          const pagada = mismoDia && cobroPrevio.has(r.id) ? cobroPrevio.get(r.id)! : r.pagada;
          return { ...r, pagada, medioPago: pagada ? 'CONTADO' : 'CRÉDITO', esManual: false };
        }),
        ...resumen.manuales.remisiones.map((r) => ({ ...r, esManual: true })),
      ];
    });
    setGastos([
      ...resumen.gastos.map((g) => ({ ...g, esManual: false })),
      ...resumen.manuales.gastos.map((g) => ({ ...g, esManual: true })),
    ]);
    setCompras([
      ...resumen.compras.map((c) => ({ ...c, medioPago: c.pagada ? 'CONTADO' : 'CRÉDITO', esManual: false })),
      ...resumen.manuales.compras.map((c) => ({ ...c, esManual: true })),
    ]);
    if (!mismoDia) {
      setFacturadoDiaAnterior(resumen.cierre?.facturadoDiaAnterior || 0);
      setEfectivoReal(resumen.cierre?.efectivoReal || 0);
      setCierreObservaciones(resumen.cierre?.observaciones || '');
    }
    setCierreGuardado(resumen.cierre);
  }, [resumen]);

  useEffect(() => {
    if (errorResumen) {
      toastError('No se pudo cargar el día', (errorResumen as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorResumen]);

  // Cálculos consolidados en tiempo real
  const totalRemisionesEmitidas = remisiones.reduce((acc, r) => acc + r.total, 0);
  const totalRemisionesCobradas = remisiones.filter((r) => r.pagada).reduce((acc, r) => acc + r.total, 0);
  const totalRemisionesCredito = remisiones.filter((r) => !r.pagada).reduce((acc, r) => acc + r.total, 0);

  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
  const totalComprasPagadas = compras.filter((c) => c.pagada).reduce((acc, c) => acc + c.monto, 0);

  // Cuadre de Flujo de Caja
  // Saldo esperado = Ventas Cobradas + Facturado Día Anterior - Gastos - Compras Pagadas
  const saldoEsperado = totalRemisionesCobradas + Number(facturadoDiaAnterior || 0) - totalGastos - totalComprasPagadas;
  const diferencia = efectivoReal - saldoEsperado;

  // ¿Hay datos del arqueo digitados que aún no se han guardado?
  const hayCambiosSinGuardar =
    Number(facturadoDiaAnterior || 0) !== (cierreGuardado?.facturadoDiaAnterior || 0) ||
    Number(efectivoReal || 0) !== (cierreGuardado?.efectivoReal || 0) ||
    cierreObservaciones.trim() !== (cierreGuardado?.observaciones || '');

  // Remisiones y compras se registran en sus formularios reales (inventario, cartera, CxP)
  // con la fecha del cierre; al guardarlas, el formulario vuelve a este cierre.
  const irAFormulario = (ruta: string) => {
    if (
      hayCambiosSinGuardar &&
      !window.confirm('Hay datos del arqueo sin guardar que se perderán. ¿Continuar de todos modos?')
    ) {
      return;
    }
    router.push(rutaDesdeCierre(ruta, fechaCierre));
  };

  // Toggle pagada/no pagada para cualquier remisión
  const togglePagadaRemision = (id: string) => {
    setRemisiones((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pagada: !r.pagada } : r)),
    );
  };

  // Registrar el gasto como gasto real del sistema (POST /gastos) con la fecha del cierre
  const crearGasto = useMutation({
    mutationFn: () => {
      const beneficiario = gastoBeneficiario.trim();
      return api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          idCategoriaGasto: gastoCategoria,
          idMetodoPago: gastoMedio || undefined,
          descripcion: beneficiario ? `${gastoConcepto.trim()} — ${beneficiario}` : gastoConcepto.trim(),
          monto: gastoMonto,
          fecha: fechaCierre,
        }),
      });
    },
    onSuccess: () => {
      setIsModalGastoOpen(false);
      setGastoConcepto('');
      setGastoMonto(0);
      setGastoBeneficiario('');
      queryClient.invalidateQueries({ queryKey: ['cierre-diario', fechaCierre] });
      success('Gasto Registrado', `El gasto quedó registrado en el sistema con fecha ${fechaCierre}.`);
    },
    onError: (err: Error) => toastError('No se pudo registrar el gasto', err.message),
  });

  const handleAddGasto = () => {
    if (!gastoConcepto.trim() || gastoMonto <= 0 || !gastoCategoria) {
      toastError('Datos incompletos', 'Ingresa el concepto, la categoría y un monto positivo.');
      return;
    }
    if (!crearGasto.isPending) crearGasto.mutate();
  };

  // Guardar y confirmar Cierre Diario
  // El servidor recalcula los totales: solo se envían los insumos del arqueo
  const guardarCierre = useMutation({
    mutationFn: () =>
      api<{ mensaje: string; cierre: CierreDiarioRecord }>(`/cierres-diarios/${fechaCierre}`, {
        method: 'PUT',
        body: JSON.stringify({
          facturadoDiaAnterior: Number(facturadoDiaAnterior || 0),
          efectivoReal: Number(efectivoReal || 0),
          observaciones: cierreObservaciones.trim() || undefined,
          ajustesRemisiones: remisiones
            .filter((r) => !r.esManual)
            .map((r) => ({ idFactura: r.id, pagada: r.pagada })),
          remisionesManuales: remisiones
            .filter((r) => r.esManual)
            .map((r) => ({
              id: r.id,
              numero: r.numero || undefined,
              cliente: r.cliente,
              total: r.total,
              pagada: r.pagada,
              medioPago: medioValido(r.medioPago),
            })),
          gastosManuales: gastos
            .filter((g) => g.esManual)
            .map((g) => ({
              id: g.id,
              concepto: g.concepto,
              categoria: g.categoria,
              monto: g.monto,
              medioPago: medioValido(g.medioPago),
              beneficiario: g.beneficiario,
            })),
          comprasManuales: compras
            .filter((c) => c.esManual)
            .map((c) => ({
              id: c.id,
              proveedor: c.proveedor,
              numeroFactura: c.numeroFactura || undefined,
              monto: c.monto,
              pagada: c.pagada,
              medioPago: medioValido(c.medioPago),
            })),
        }),
      }),
    onSuccess: (res) => {
      setCierreGuardado(res.cierre);
      queryClient.invalidateQueries({ queryKey: ['cierre-diario', fechaCierre] });
      success('Cierre Diario Consolidado', `El cierre del día ${fechaCierre} quedó guardado en el sistema.`);
    },
    onError: (err: Error) => {
      toastError('No se pudo guardar el cierre', err.message);
    },
  });

  const handleGuardarCierre = () => {
    if (!guardarCierre.isPending) guardarCierre.mutate();
  };

  // Imprimir soporte de cierre
  const handleImprimir = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e2e8f0] print:border-none">
          <div className="flex items-center gap-3">
            <Link href="/contabilidad/cierre" className="print:hidden">
              <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">Cierre Contable Diario</h1>
                {cierreGuardado && (
                  <Badge variant="active" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Cierre Consolidado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[#64748b]">
                Centralización integral: remisiones, facturado anterior, egresos, compras y cuadre de caja
              </p>
              {cargandoResumen && <p className="text-xs text-[#1d63ed]">Cargando movimientos del día…</p>}
              {cierreGuardado && (
                <p className="text-[11px] text-[#64748b]">
                  Guardado por {cierreGuardado.cerradoPor?.nombre || cierreGuardado.cerradoPor?.email || '—'} el{' '}
                  {new Date(cierreGuardado.actualizadoEn).toLocaleString('es-CO')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center gap-1.5 bg-white border border-[#e2e8f0] px-3 py-1.5 rounded-lg text-xs">
              <Calendar className="w-4 h-4 text-[#64748b]" />
              <input
                type="date"
                value={fechaCierre}
                onChange={(e) => setFechaCierre(e.target.value)}
                className="bg-transparent text-xs font-semibold text-[#0f172a] outline-none cursor-pointer"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<Printer className="w-4 h-4" />}
              onClick={handleImprimir}
            >
              Imprimir
            </Button>

            <Button
              variant="primary"
              size="sm"
              className="bg-[#10b981] hover:bg-[#059669] text-white"
              icon={<Save className="w-4 h-4" />}
              onClick={handleGuardarCierre}
              isLoading={guardarCierre.isPending}
              disabled={cargandoResumen}
            >
              Guardar Cierre
            </Button>
          </div>
        </div>

        {/* Tarjetas KPI Resumen del Día */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
              <span>Ventas Cobradas</span>
              <Receipt className="w-4 h-4 text-[#10b981]" />
            </div>
            <div className="text-lg font-bold text-[#0f172a] tabular-nums">
              {formatCOP(totalRemisionesCobradas)}
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">
              De {formatCOP(totalRemisionesEmitidas)} emitidas
            </div>
          </div>

          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
              <span>Facturado Día Anterior</span>
              <Building className="w-4 h-4 text-[#1d63ed]" />
            </div>
            <div className="text-lg font-bold text-[#1d63ed] tabular-nums">
              {formatCOP(facturadoDiaAnterior)}
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">
              Ref. Siigo / Facturación previa
            </div>
          </div>

          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
              <span>Gastos del Día</span>
              <TrendingDown className="w-4 h-4 text-[#ef4444]" />
            </div>
            <div className="text-lg font-bold text-[#ef4444] tabular-nums">
              {formatCOP(totalGastos)}
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">
              {gastos.length} registro(s) hoy
            </div>
          </div>

          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between text-xs text-[#64748b] mb-1">
              <span>Compras a Proveedores</span>
              <ShoppingBag className="w-4 h-4 text-[#f59e0b]" />
            </div>
            <div className="text-lg font-bold text-[#f59e0b] tabular-nums">
              {formatCOP(totalComprasPagadas)}
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">
              Compras pagadas en el día
            </div>
          </div>

          <div className="bg-[#0f172a] text-white rounded-xl p-4 shadow-card col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
              <span>Saldo Esperado en Caja</span>
              <DollarSign className="w-4 h-4 text-[#38bdf8]" />
            </div>
            <div className="text-lg font-bold text-white tabular-nums">
              {formatCOP(saldoEsperado)}
            </div>
            <div className="text-[11px] text-[#94a3b8] mt-0.5">
              Arqueo neto del día
            </div>
          </div>
        </div>

        {/* Sección: Facturado Día Anterior (Siigo) */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[#1d63ed]" />
              <h2 className="text-sm font-semibold text-[#0f172a]">
                Facturado Día Anterior (Ventas Externas / Referencia Siigo)
              </h2>
            </div>
            <span className="text-[11px] text-[#64748b]">
              Ingresa el total reportado en la facturación del día anterior
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-[#f8fafc] p-3 rounded-lg border border-[#e2e8f0]">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-[#64748b] uppercase block mb-1">
                Monto Facturado Día Anterior (COP)
              </label>
              <Input
                type="number"
                min={0}
                value={facturadoDiaAnterior}
                onChange={(e) => setFacturadoDiaAnterior(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="Ej. 1500000"
              />
            </div>
            <div className="text-xs text-[#64748b] space-y-1">
              <span className="font-semibold text-[#0f172a] block">Impacto en el cierre:</span>
              <p>Este valor se incorpora directamente a los ingresos para cuadrar la caja con la contabilidad.</p>
            </div>
          </div>
        </div>

        {/* Grid 2 Columnas: Remisiones y Gastos/Compras */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna Izquierda: Remisiones del Día */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#10b981]" />
                <h2 className="text-sm font-semibold text-[#0f172a]">Remisiones de Venta del Día</h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => irAFormulario('/facturacion/nueva')}
                title="Emite la remisión real (descuenta inventario y genera cartera) con la fecha de este cierre"
              >
                Emitir Remisión
              </Button>
            </div>

            {remisiones.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748b] border border-dashed border-[#cbd5e1] rounded-lg">
                No hay remisiones registradas para esta fecha. Usa «Emitir Remisión» para registrar una.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">N° Doc</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3 text-right">Monto</th>
                      <th className="py-2.5 px-3 text-center">Estado Pago</th>
                      <th className="py-2.5 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {remisiones.map((r) => (
                      <tr key={r.id} className={r.esManual ? 'bg-amber-50/40' : ''}>
                        <td className="py-2.5 px-3 font-semibold text-[#0f172a]">
                          {r.numero}
                          {r.esManual && (
                            <span className="block text-[10px] text-amber-700 font-normal">Manual</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[#334155]">{r.cliente}</td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#0f172a]">
                          {formatCOP(r.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => togglePagadaRemision(r.id)}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                              r.pagada
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-amber-50 text-amber-700 border-amber-300'
                            }`}
                            title="Haz clic para alternar entre Pagada y Crédito"
                          >
                            {r.pagada ? '✓ Pagada' : '⏳ Crédito'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.esManual && (
                            <button
                              onClick={() => setRemisiones((prev) => prev.filter((it) => it.id !== r.id))}
                              className="text-[#ef4444] hover:text-[#dc2626] p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#f8fafc] border-t border-[#e2e8f0] font-semibold text-[#0f172a]">
                    <tr>
                      <td colSpan={2} className="py-2 px-3">
                        Total Cobrado en Caja:
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700 tabular-nums">
                        {formatCOP(totalRemisionesCobradas)}
                      </td>
                      <td colSpan={2} className="py-2 px-3 text-right text-amber-700 text-[11px]">
                        Crédito: {formatCOP(totalRemisionesCredito)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Columna Derecha: Gastos y Compras */}
          <div className="space-y-6">
            {/* Gastos del Día */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-[#ef4444]" />
                  <h2 className="text-sm font-semibold text-[#0f172a]">Gastos Operativos del Día</h2>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIsModalGastoOpen(true)}
                >
                  Registrar Gasto
                </Button>
              </div>

              {gastos.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#64748b] border border-dashed border-[#cbd5e1] rounded-lg">
                  No hay gastos registrados hoy.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Concepto</th>
                        <th className="py-2.5 px-3">Categoría</th>
                        <th className="py-2.5 px-3 text-right">Monto</th>
                        <th className="py-2.5 px-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {gastos.map((g) => (
                        <tr key={g.id}>
                          <td className="py-2.5 px-3 font-semibold text-[#0f172a]">{g.concepto}</td>
                          <td className="py-2.5 px-3 text-[#64748b]">{g.categoria}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#ef4444] tabular-nums">
                            {formatCOP(g.monto)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {g.esManual ? (
                              <button
                                onClick={() => setGastos((prev) => prev.filter((it) => it.id !== g.id))}
                                className="text-[#ef4444] hover:text-[#dc2626] p-1"
                                title="Quitar gasto manual"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-[#94a3b8]">Sistema</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#f8fafc] border-t border-[#e2e8f0] font-semibold">
                      <tr>
                        <td colSpan={2} className="py-2 px-3">
                          Total Gastos:
                        </td>
                        <td className="py-2 px-3 text-right text-[#ef4444] tabular-nums">
                          {formatCOP(totalGastos)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Compras a Proveedores del Día */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#f59e0b]" />
                  <h2 className="text-sm font-semibold text-[#0f172a]">Compras a Proveedores del Día</h2>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => irAFormulario('/proveedores/compras/nueva')}
                  title="Registra la factura de compra real (entrada a inventario y CxP) con la fecha de este cierre"
                >
                  Registrar Compra
                </Button>
              </div>

              {compras.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#64748b] border border-dashed border-[#cbd5e1] rounded-lg">
                  No hay compras a proveedores registradas hoy.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Proveedor</th>
                        <th className="py-2.5 px-3">N° Factura</th>
                        <th className="py-2.5 px-3 text-right">Monto</th>
                        <th className="py-2.5 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {compras.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 px-3 font-semibold text-[#0f172a]">{c.proveedor}</td>
                          <td className="py-2.5 px-3 text-[#64748b]">{c.numeroFactura}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#f59e0b] tabular-nums">
                            {formatCOP(c.monto)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                c.pagada ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {c.pagada ? 'Pagada' : 'Crédito'}
                            </span>
                            {c.esManual && (
                              <button
                                onClick={() => setCompras((prev) => prev.filter((it) => it.id !== c.id))}
                                className="text-[#ef4444] hover:text-[#dc2626] p-1 ml-1 align-middle"
                                title="Quitar compra manual"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#f8fafc] border-t border-[#e2e8f0] font-semibold">
                      <tr>
                        <td colSpan={2} className="py-2 px-3">
                          Total Pagado en Compras:
                        </td>
                        <td className="py-2 px-3 text-right text-[#f59e0b] tabular-nums">
                          {formatCOP(totalComprasPagadas)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sección de Cuadre de Caja y Consolidación */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
            <div>
              <h2 className="text-base font-bold text-[#0f172a]">Arqueo de Caja y Balance Definitivo del Cierre</h2>
              <p className="text-xs text-[#64748b]">
                Cuadre en una sola página: compara el saldo esperado por sistema contra el dinero físico contado
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#64748b] block">Fecha de Cierre</span>
              <span className="text-sm font-bold text-[#0f172a]">{fechaCierre}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Resumen Contable */}
            <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] space-y-3 text-xs">
              <span className="font-semibold text-[#0f172a] uppercase tracking-wider block">
                Fórmula de Arqueo
              </span>

              <div className="flex justify-between items-center text-emerald-700">
                <span>(+) Remisiones Pagadas:</span>
                <span className="font-semibold tabular-nums">{formatCOP(totalRemisionesCobradas)}</span>
              </div>
              <div className="flex justify-between items-center text-[#1d63ed]">
                <span>(+) Facturado Día Anterior (Siigo):</span>
                <span className="font-semibold tabular-nums">{formatCOP(facturadoDiaAnterior)}</span>
              </div>
              <div className="flex justify-between items-center text-[#ef4444]">
                <span>(-) Gastos del Día:</span>
                <span className="font-semibold tabular-nums">-{formatCOP(totalGastos)}</span>
              </div>
              <div className="flex justify-between items-center text-[#f59e0b]">
                <span>(-) Compras Pagadas a Proveedores:</span>
                <span className="font-semibold tabular-nums">-{formatCOP(totalComprasPagadas)}</span>
              </div>

              <div className="pt-2 border-t border-[#cbd5e1] flex justify-between items-center text-sm font-bold text-[#0f172a]">
                <span>(=) Saldo Esperado en Caja:</span>
                <span className="text-base tabular-nums">{formatCOP(saldoEsperado)}</span>
              </div>
            </div>

            {/* Arqueo de Efectivo Físico */}
            <div className="bg-white p-4 rounded-xl border border-[#e2e8f0] space-y-4">
              <span className="font-semibold text-[#0f172a] uppercase tracking-wider text-xs block">
                Dinero Real en Caja Física
              </span>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">
                  Efectivo Total Contado (COP)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={efectivoReal}
                  onChange={(e) => setEfectivoReal(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Ej. 1250000"
                  className="text-base font-bold text-[#0f172a]"
                />
              </div>

              {/* Resultado del Cuadre */}
              <div className="p-3 rounded-lg border flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold block">Diferencia de Caja:</span>
                  <span className="text-[11px] text-[#64748b]">
                    {diferencia === 0
                      ? 'Cuadre exacto (sin diferencias)'
                      : diferencia > 0
                      ? 'Sobrante en caja'
                      : 'Faltante en caja'}
                  </span>
                </div>
                <div
                  className={`text-base font-bold tabular-nums ${
                    diferencia === 0
                      ? 'text-emerald-600'
                      : diferencia > 0
                      ? 'text-[#1d63ed]'
                      : 'text-[#ef4444]'
                  }`}
                >
                  {diferencia > 0 ? `+${formatCOP(diferencia)}` : formatCOP(diferencia)}
                </div>
              </div>
            </div>

            {/* Observaciones y Botón Final */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">
                  Observaciones / Notas del Cierre
                </label>
                <textarea
                  rows={3}
                  value={cierreObservaciones}
                  onChange={(e) => setCierreObservaciones(e.target.value)}
                  placeholder="Detalles sobre novedades de caja, justificación de diferencias, cheques o transferencias recibidas..."
                  className="w-full text-xs p-3 border border-[#e2e8f0] rounded-lg focus:border-[#1d63ed] outline-none"
                />
              </div>

              <Button
                variant="primary"
                className="w-full justify-center h-12 text-sm font-bold bg-[#10b981] hover:bg-[#059669] text-white shadow-md"
                icon={<Save className="w-5 h-5 mr-1" />}
                onClick={handleGuardarCierre}
                isLoading={guardarCierre.isPending}
                disabled={cargandoResumen}
              >
                Guardar y Consolidar Cierre Diario
              </Button>
            </div>
          </div>
        </div>

        {/* Modal para Agregar Gasto */}
        <Modal
          isOpen={isModalGastoOpen}
          onClose={() => setIsModalGastoOpen(false)}
          title="Registrar Gasto del Día"
        >
          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-[#64748b]">Concepto del Gasto *</label>
              <Input
                placeholder="Ej. Almuerzos, Transporte, Papelería, Aseo..."
                value={gastoConcepto}
                onChange={(e) => setGastoConcepto(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-[#64748b]">Categoría *</label>
                <select
                  value={gastoCategoria}
                  onChange={(e) => setGastoCategoria(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md"
                >
                  <option value="">Selecciona…</option>
                  {categoriasGasto.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#64748b]">Monto (COP) *</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={gastoMonto}
                  onChange={(e) => setGastoMonto(Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#64748b]">Beneficiario / Proveedor del Servicio</label>
              <Input
                placeholder="A quién se le pagó"
                value={gastoBeneficiario}
                onChange={(e) => setGastoBeneficiario(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#64748b]">Medio de Pago</label>
              <select
                value={gastoMedio}
                onChange={(e) => setGastoMedio(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md"
              >
                <option value="">Sin especificar</option>
                {mediosPago.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-[#64748b]">
              Se registra como gasto real del sistema con fecha {fechaCierre} y queda en el módulo de gastos.
            </p>

            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalGastoOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleAddGasto} isLoading={crearGasto.isPending}>
                Registrar Gasto
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    </AppLayout>
  );
}

