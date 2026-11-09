'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { formatCOP, formatPeriodo } from '@/lib/format';
import { fechaLocalHoy } from '@/lib/cierre-diario';

interface InformeMensual {
  periodo: string;
  desde: string;
  hasta: string;
  estado: {
    cerrado: boolean;
    fechaCierre?: string | null;
    cerradoPor?: string | null;
    observaciones?: string | null;
    motivoReapertura?: string | null;
  };
  resumen: {
    ventas: { cantidad: number; total: number; cobrado: number; porCobrar: number };
    compras: { cantidad: number; total: number; pagado: number; porPagar: number };
    gastos: { cantidad: number; total: number; porCategoria: { categoria: string; total: number }[] };
    flujoCaja: number;
  };
  resultados: {
    ingresos: number;
    costoMercancia: number;
    utilidadBruta: number;
    margenBrutoPct: number;
    gastos: number;
    utilidadOperativa: number;
    ivaGenerado: number;
  };
  cierresDiarios: {
    cantidad: number;
    diasConMovimiento: number;
    diasSinCierre: string[];
    sobrantes: number;
    faltantes: number;
    diferenciaNeta: number;
    detalle: { fecha: string; saldoEsperado: number; efectivoReal: number; diferencia: number; cerradoPor?: string }[];
  };
  porDia: {
    fecha: string;
    ventas: number;
    cobrado: number;
    gastos: number;
    compras: number;
    comprasPagadas: number;
    cierre: { saldoEsperado: number; efectivoReal: number; diferencia: number } | null;
  }[];
  detalle: {
    ventas: { id: string; numero: string; fecha: string; cliente: string; total: number; cobrado: number }[];
    compras: { id: string; numeroFactura: string; fecha: string; proveedor: string; total: number; pagado: number }[];
    gastos: { id: string; fecha: string; descripcion: string; categoria: string; medioPago?: string; monto: number }[];
  };
}

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const diaCorto = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
};

function Diferencia({ valor }: { valor: number }) {
  if (Math.abs(valor) < 1) return <span className="text-emerald-700 font-semibold">Cuadrada</span>;
  return valor > 0 ? (
    <span className="text-[#1d63ed] font-semibold">Sobrante {formatCOP(valor)}</span>
  ) : (
    <span className="text-[#dc2626] font-semibold">Faltante {formatCOP(-valor)}</span>
  );
}

function Seccion({ titulo, children, className = '' }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`bg-white border border-[#e2e8f0] rounded-xl p-5 shadow-card print:shadow-none print:border-black print:rounded-none print:p-3 break-inside-avoid ${className}`}
    >
      <h2 className="text-sm font-bold text-[#0f172a] uppercase tracking-wider mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function Linea({ etiqueta, valor, signo, fuerte }: { etiqueta: string; valor: number; signo?: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${fuerte ? 'font-bold text-[#0f172a] border-t border-[#cbd5e1] pt-2 mt-1' : 'text-[#334155]'}`}>
      <span>
        {signo && <span className="inline-block w-5">{signo}</span>}
        {etiqueta}
      </span>
      <span className="tabular-nums">{formatCOP(valor)}</span>
    </div>
  );
}

export default function InformeMensualPage() {
  const router = useRouter();
  const mesAnterior = (() => {
    const [a, m] = fechaLocalHoy().split('-').map(Number);
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  })();
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [recienCerrado, setRecienCerrado] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);

  // ?periodo=YYYY-MM (por defecto, el mes anterior) y ?cerrado=1 al venir de cerrar el mes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('periodo');
    setPeriodo(p && PERIODO.test(p) ? p : mesAnterior);
    setRecienCerrado(params.get('cerrado') === '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: inf, isLoading, error } = useQuery<InformeMensual>({
    queryKey: ['informe-mensual', periodo],
    queryFn: () => api<InformeMensual>(`/reportes/cierre-mensual/${periodo}`),
    enabled: !!periodo,
  });

  const cambiarPeriodo = (p: string) => {
    if (!PERIODO.test(p)) return;
    setPeriodo(p);
    setRecienCerrado(false);
    router.replace(`/contabilidad/cierre/mes?periodo=${p}`);
  };

  const ganancia = inf ? inf.resultados.utilidadOperativa : 0;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-6xl mx-auto pb-12 print:space-y-3 print:text-[11px]">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e2e8f0] print:border-black print:pb-2">
          <div className="flex items-center gap-3">
            <Link href="/contabilidad/cierre" className="print:hidden">
              <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">
                Informe del mes — {periodo ? formatPeriodo(periodo) : '…'}
              </h1>
              {inf && (
                <p className="text-xs text-[#64748b] flex items-center gap-1.5">
                  {inf.estado.cerrado ? (
                    <>
                      <Lock className="w-3.5 h-3.5" /> Mes cerrado
                      {inf.estado.fechaCierre && ` el ${new Date(inf.estado.fechaCierre).toLocaleString('es-CO')}`}
                      {inf.estado.cerradoPor && ` por ${inf.estado.cerradoPor}`}
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" /> Mes abierto: las cifras pueden cambiar hasta que se cierre
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <input
              type="month"
              value={periodo ?? ''}
              onChange={(e) => cambiarPeriodo(e.target.value)}
              className="h-[34px] px-2 text-xs border border-[#e2e8f0] rounded-md bg-white"
              aria-label="Cambiar mes"
            />
            <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()} disabled={!inf}>
              Imprimir
            </Button>
          </div>
        </div>

        {recienCerrado && inf?.estado.cerrado && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm flex items-start gap-2 print:hidden">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Mes cerrado correctamente.</p>
              <p className="text-xs">
                Ya no se pueden registrar ventas, compras ni gastos con fecha de {formatPeriodo(inf.periodo)}. Este es el
                informe consolidado del mes: puedes imprimirlo como soporte del cierre.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-[#64748b]">
            <Loader2 className="w-5 h-5 animate-spin" /> Consolidando el mes…
          </div>
        )}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            No se pudo generar el informe: {(error as Error).message}
          </div>
        )}

        {inf && (
          <>
            {inf.cierresDiarios.diasSinCierre.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2 print:border-black print:bg-white">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">
                    {inf.cierresDiarios.diasSinCierre.length} día(s) con movimientos no tienen cierre diario de caja
                  </p>
                  <p className="mt-1">
                    {inf.cierresDiarios.diasSinCierre.map(diaCorto).join(' · ')}
                  </p>
                  {!inf.estado.cerrado && (
                    <p className="mt-1 print:hidden">
                      Puedes hacer esos cierres desde{' '}
                      <Link
                        href={`/contabilidad/cierre/diario?fecha=${inf.cierresDiarios.diasSinCierre[0]}`}
                        className="underline font-semibold"
                      >
                        Cierre Diario
                      </Link>{' '}
                      antes de cerrar el mes.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tarjetas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tarjeta
                icono={<Receipt className="w-4 h-4 text-[#10b981]" />}
                titulo="Ventas"
                valor={inf.resumen.ventas.total}
                lineas={[
                  `${inf.resumen.ventas.cantidad} remisiones`,
                  `Cobrado ${formatCOP(inf.resumen.ventas.cobrado)}`,
                  `Por cobrar ${formatCOP(inf.resumen.ventas.porCobrar)}`,
                ]}
              />
              <Tarjeta
                icono={<ShoppingBag className="w-4 h-4 text-[#f59e0b]" />}
                titulo="Compras"
                valor={inf.resumen.compras.total}
                lineas={[
                  `${inf.resumen.compras.cantidad} facturas`,
                  `Pagado ${formatCOP(inf.resumen.compras.pagado)}`,
                  `Por pagar ${formatCOP(inf.resumen.compras.porPagar)}`,
                ]}
              />
              <Tarjeta
                icono={<TrendingDown className="w-4 h-4 text-[#ef4444]" />}
                titulo="Gastos"
                valor={inf.resumen.gastos.total}
                lineas={[`${inf.resumen.gastos.cantidad} gastos registrados`]}
              />
              <Tarjeta
                icono={<TrendingUp className={`w-4 h-4 ${ganancia >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`} />}
                titulo={ganancia >= 0 ? 'Ganancia del mes' : 'Pérdida del mes'}
                valor={Math.abs(ganancia)}
                lineas={[`Margen bruto ${inf.resultados.margenBrutoPct}%`]}
                destacado={ganancia >= 0 ? 'positivo' : 'negativo'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
              <Seccion titulo="¿Cómo le fue al negocio?">
                <div className="text-xs">
                  <Linea etiqueta="Ventas (sin IVA)" valor={inf.resultados.ingresos} signo="+" />
                  <Linea etiqueta="Costo de los repuestos vendidos" valor={inf.resultados.costoMercancia} signo="−" />
                  <Linea etiqueta="Utilidad bruta" valor={inf.resultados.utilidadBruta} signo="=" fuerte />
                  <Linea etiqueta="Gastos del mes" valor={inf.resultados.gastos} signo="−" />
                  <Linea
                    etiqueta={ganancia >= 0 ? 'Ganancia del mes' : 'Pérdida del mes'}
                    valor={Math.abs(ganancia)}
                    signo="="
                    fuerte
                  />
                  <p className="text-[11px] text-[#64748b] mt-2">
                    IVA cobrado en las ventas: {formatCOP(inf.resultados.ivaGenerado)} (no es ingreso del negocio).
                  </p>
                </div>
              </Seccion>

              <Seccion titulo="Movimiento de dinero del mes">
                <div className="text-xs">
                  <Linea etiqueta="Cobrado de las ventas" valor={inf.resumen.ventas.cobrado} signo="+" />
                  <Linea etiqueta="Pagado a proveedores" valor={inf.resumen.compras.pagado} signo="−" />
                  <Linea etiqueta="Gastos pagados" valor={inf.resumen.gastos.total} signo="−" />
                  <Linea
                    etiqueta={inf.resumen.flujoCaja >= 0 ? 'Entró más de lo que salió' : 'Salió más de lo que entró'}
                    valor={Math.abs(inf.resumen.flujoCaja)}
                    signo="="
                    fuerte
                  />
                  <p className="text-[11px] text-[#64748b] mt-2">
                    Quedan por cobrar {formatCOP(inf.resumen.ventas.porCobrar)} y por pagar{' '}
                    {formatCOP(inf.resumen.compras.porPagar)} de lo registrado en el mes.
                  </p>
                </div>
              </Seccion>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
              <Seccion titulo="Cierres diarios de caja">
                <div className="text-xs space-y-1.5">
                  <p>
                    <strong>{inf.cierresDiarios.cantidad}</strong> cierres hechos de{' '}
                    <strong>{inf.cierresDiarios.diasConMovimiento}</strong> días con movimiento.
                  </p>
                  <div className="flex justify-between"><span>Total sobrantes</span><span className="tabular-nums text-[#1d63ed]">{formatCOP(inf.cierresDiarios.sobrantes)}</span></div>
                  <div className="flex justify-between"><span>Total faltantes</span><span className="tabular-nums text-[#dc2626]">{formatCOP(inf.cierresDiarios.faltantes)}</span></div>
                  <div className="flex justify-between font-bold border-t border-[#cbd5e1] pt-1.5">
                    <span>Resultado de caja del mes</span>
                    <Diferencia valor={inf.cierresDiarios.diferenciaNeta} />
                  </div>
                </div>
              </Seccion>

              <Seccion titulo="Gastos por categoría">
                {inf.resumen.gastos.porCategoria.length === 0 ? (
                  <p className="text-xs text-[#64748b]">No hubo gastos este mes.</p>
                ) : (
                  <div className="text-xs space-y-1">
                    {inf.resumen.gastos.porCategoria.map((c) => (
                      <div key={c.categoria} className="flex justify-between gap-3">
                        <span className="truncate">{c.categoria}</span>
                        <span className="tabular-nums whitespace-nowrap">
                          {formatCOP(c.total)}{' '}
                          <span className="text-[#94a3b8]">
                            ({inf.resumen.gastos.total > 0 ? Math.round((c.total / inf.resumen.gastos.total) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>
            </div>

            {/* Día por día */}
            <Seccion titulo="Día por día">
              {inf.porDia.length === 0 ? (
                <p className="text-xs text-[#64748b]">No hubo movimientos en este mes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[#64748b] uppercase text-[10px] tracking-wider border-b border-[#e2e8f0] print:border-black">
                      <tr>
                        <th className="text-left py-2 pr-2">Día</th>
                        <th className="text-right py-2 px-2">Ventas</th>
                        <th className="text-right py-2 px-2">Cobrado</th>
                        <th className="text-right py-2 px-2">Gastos</th>
                        <th className="text-right py-2 px-2">Compras</th>
                        <th className="text-right py-2 pl-2">Cierre de caja</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {inf.porDia.map((d) => (
                        <tr key={d.fecha}>
                          <td className="py-1.5 pr-2 capitalize">{diaCorto(d.fecha)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{formatCOP(d.ventas)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{formatCOP(d.cobrado)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{formatCOP(d.gastos)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{formatCOP(d.compras)}</td>
                          <td className="py-1.5 pl-2 text-right">
                            {d.cierre ? (
                              <Diferencia valor={d.cierre.diferencia} />
                            ) : (
                              <span className="text-amber-700">Sin cierre</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t-2 border-[#cbd5e1] print:border-black">
                        <td className="py-2 pr-2">Total</td>
                        <td className="py-2 px-2 text-right tabular-nums">{formatCOP(inf.resumen.ventas.total)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{formatCOP(inf.resumen.ventas.cobrado)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{formatCOP(inf.resumen.gastos.total)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{formatCOP(inf.resumen.compras.total)}</td>
                        <td className="py-2 pl-2 text-right">
                          <Diferencia valor={inf.cierresDiarios.diferenciaNeta} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>

            {/* Detalle */}
            <div className="print:hidden">
              <Button variant="outline" size="sm" onClick={() => setVerDetalle((v) => !v)}>
                {verDetalle ? 'Ocultar detalle de documentos' : 'Ver detalle de ventas, compras y gastos'}
              </Button>
            </div>
            <div className={verDetalle ? 'space-y-4' : 'hidden print:block print:space-y-3'}>
              <Detalle
                titulo={`Ventas del mes (${inf.detalle.ventas.length})`}
                columnas={['Fecha', 'N°', 'Cliente', 'Cobrado', 'Total']}
                filas={inf.detalle.ventas.map((v) => [v.fecha, v.numero, v.cliente, formatCOP(v.cobrado), formatCOP(v.total)])}
              />
              <Detalle
                titulo={`Compras del mes (${inf.detalle.compras.length})`}
                columnas={['Fecha', 'N° factura', 'Proveedor', 'Pagado', 'Total']}
                filas={inf.detalle.compras.map((c) => [c.fecha, c.numeroFactura || '—', c.proveedor, formatCOP(c.pagado), formatCOP(c.total)])}
              />
              <Detalle
                titulo={`Gastos del mes (${inf.detalle.gastos.length})`}
                columnas={['Fecha', 'Concepto', 'Categoría', 'Medio', 'Valor']}
                filas={inf.detalle.gastos.map((g) => [g.fecha, g.descripcion, g.categoria, g.medioPago || '—', formatCOP(g.monto)])}
              />
            </div>

            {(inf.estado.observaciones || inf.estado.motivoReapertura) && (
              <Seccion titulo="Observaciones">
                {inf.estado.observaciones && <p className="text-xs">{inf.estado.observaciones}</p>}
                {inf.estado.motivoReapertura && !inf.estado.cerrado && (
                  <p className="text-xs text-[#64748b] mt-1">Reabierto por: {inf.estado.motivoReapertura}</p>
                )}
              </Seccion>
            )}

            {/* Firmas (solo impreso) */}
            <div className="hidden print:grid grid-cols-2 gap-12 pt-12 text-[11px]">
              <div className="border-t border-black pt-1 text-center">Elaboró</div>
              <div className="border-t border-black pt-1 text-center">Revisó / aprobó</div>
            </div>
            <p className="hidden print:block text-[10px] text-[#475569]">Impreso: {new Date().toLocaleString('es-CO')}</p>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Tarjeta({
  icono,
  titulo,
  valor,
  lineas,
  destacado,
}: {
  icono: React.ReactNode;
  titulo: string;
  valor: number;
  lineas: string[];
  destacado?: 'positivo' | 'negativo';
}) {
  const color = destacado === 'positivo' ? 'text-emerald-700' : destacado === 'negativo' ? 'text-[#dc2626]' : 'text-[#0f172a]';
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-card print:shadow-none print:border-black print:rounded-none print:p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
        {icono}
        {titulo}
      </div>
      <p className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{formatCOP(valor)}</p>
      {lineas.map((l) => (
        <p key={l} className="text-[11px] text-[#64748b]">
          {l}
        </p>
      ))}
    </div>
  );
}

function Detalle({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: string[][] }) {
  return (
    <Seccion titulo={titulo} className="break-inside-auto">
      {filas.length === 0 ? (
        <p className="text-xs text-[#64748b]">Sin registros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#64748b] uppercase text-[10px] tracking-wider border-b border-[#e2e8f0] print:border-black">
              <tr>
                {columnas.map((c, i) => (
                  <th key={c} className={`py-1.5 px-1 ${i >= columnas.length - 2 ? 'text-right' : 'text-left'}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {filas.map((f, i) => (
                <tr key={i} className="break-inside-avoid">
                  {f.map((celda, j) => (
                    <td key={j} className={`py-1 px-1 ${j >= f.length - 2 ? 'text-right tabular-nums' : ''}`}>
                      {celda}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}
