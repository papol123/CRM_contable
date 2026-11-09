import React from 'react';
import { formatCOP } from '@/lib/format';

/**
 * Comprobante imprimible del cierre diario. Solo se ve al imprimir (print:block):
 * reemplaza la pantalla por un documento limpio, en lenguaje sencillo y con firmas.
 */
export interface ComprobanteCierreProps {
  fecha: string;
  empresa?: {
    razonSocial?: string;
    nombreComercial?: string;
    nit?: string;
    direccion?: string;
    telefono?: string;
    ciudad?: string;
  };
  remisiones: { id: string; numero: string; cliente: string; total: number; pagada: boolean }[];
  gastos: { id: string; concepto: string; categoria: string; monto: number; medioPago: string }[];
  compras: { id: string; proveedor: string; numeroFactura: string; monto: number; pagada: boolean }[];
  facturadoDiaAnterior: number;
  efectivoReal: number;
  observaciones: string;
  guardado: { por: string; el: string } | null;
  borrador: boolean;
}

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function Fila({ etiqueta, valor, signo, fuerte, sangria }: {
  etiqueta: string;
  valor: number;
  signo?: '+' | '−' | '=';
  fuerte?: boolean;
  sangria?: boolean;
}) {
  return (
    <tr className={fuerte ? 'font-bold' : ''}>
      <td className={`py-1 ${sangria ? 'pl-6 text-[#475569]' : ''}`}>
        {signo && <span className="inline-block w-4">{signo}</span>}
        {etiqueta}
      </td>
      <td className="py-1 text-right tabular-nums">{formatCOP(valor)}</td>
    </tr>
  );
}

export function ComprobanteCierre(p: ComprobanteCierreProps) {
  const ventas = p.remisiones.reduce((a, r) => a + r.total, 0);
  const cobradas = p.remisiones.filter((r) => r.pagada).reduce((a, r) => a + r.total, 0);
  const credito = ventas - cobradas;
  const gastos = p.gastos.reduce((a, g) => a + g.monto, 0);
  const comprasPagadas = p.compras.filter((c) => c.pagada).reduce((a, c) => a + c.monto, 0);
  const comprasCredito = p.compras.filter((c) => !c.pagada).reduce((a, c) => a + c.monto, 0);
  const esperado = cobradas + p.facturadoDiaAnterior - gastos - comprasPagadas;
  const diferencia = p.efectivoReal - esperado;
  const cuadra = Math.abs(diferencia) < 1;
  const nombreEmpresa = p.empresa?.nombreComercial || p.empresa?.razonSocial || 'CRM Contable';

  return (
    <div className="hidden print:block text-[11px] text-black leading-snug">
      {/* Encabezado */}
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
        <div>
          <p className="text-base font-bold uppercase">{nombreEmpresa}</p>
          {p.empresa?.razonSocial && p.empresa.razonSocial !== nombreEmpresa && <p>{p.empresa.razonSocial}</p>}
          {p.empresa?.nit && <p>NIT {p.empresa.nit}</p>}
          {(p.empresa?.direccion || p.empresa?.telefono) && (
            <p>
              {[p.empresa?.direccion, p.empresa?.ciudad, p.empresa?.telefono].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-bold">CIERRE DIARIO DE CAJA</p>
          <p className="capitalize">{fechaLarga(p.fecha)}</p>
          <p className="text-[10px] text-[#475569]">Impreso: {new Date().toLocaleString('es-CO')}</p>
        </div>
      </div>

      {p.borrador && (
        <p className="mb-3 p-2 border-2 border-black text-center font-bold uppercase">
          Borrador — este cierre tiene cambios sin guardar
        </p>
      )}

      {/* Resultado del día */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-black rounded p-3">
          <p className="font-bold uppercase mb-1">¿Cuánto debe haber en caja?</p>
          <table className="w-full">
            <tbody>
              <Fila signo="+" etiqueta="Ventas cobradas hoy" valor={cobradas} />
              <Fila signo="+" etiqueta="Facturado del día anterior" valor={p.facturadoDiaAnterior} />
              <Fila signo="−" etiqueta="Gastos pagados" valor={gastos} />
              <Fila signo="−" etiqueta="Compras pagadas a proveedores" valor={comprasPagadas} />
              <tr className="border-t border-black font-bold text-[13px]">
                <td className="pt-1.5">= Dinero que debe haber</td>
                <td className="pt-1.5 text-right tabular-nums">{formatCOP(esperado)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border border-black rounded p-3 flex flex-col justify-between">
          <div>
            <p className="font-bold uppercase mb-1">Arqueo</p>
            <table className="w-full">
              <tbody>
                <Fila etiqueta="Dinero que debe haber" valor={esperado} />
                <Fila etiqueta="Dinero contado en caja" valor={p.efectivoReal} fuerte />
              </tbody>
            </table>
          </div>
          <div className="mt-2 p-2 border-2 border-black text-center">
            <p className="text-[10px] uppercase">Resultado</p>
            <p className="text-[15px] font-bold">
              {cuadra
                ? 'CAJA CUADRADA'
                : diferencia > 0
                  ? `SOBRANTE de ${formatCOP(diferencia)}`
                  : `FALTANTE de ${formatCOP(-diferencia)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Ventas totales para referencia */}
      <table className="w-full mb-4 border border-black">
        <tbody>
          <tr className="bg-[#f1f5f9]">
            <td className="p-1.5 font-bold" colSpan={2}>Ventas del día (para referencia)</td>
          </tr>
          <Fila etiqueta={`Total vendido (${p.remisiones.length} remisiones)`} valor={ventas} fuerte sangria />
          <Fila etiqueta="Cobrado (entró a caja)" valor={cobradas} sangria />
          <Fila etiqueta="Fiado / a crédito (no entró a caja)" valor={credito} sangria />
          {comprasCredito > 0 && <Fila etiqueta="Compras a crédito (no salieron de caja)" valor={comprasCredito} sangria />}
        </tbody>
      </table>

      <Detalle
        titulo="1. Ventas (remisiones)"
        vacio="No hubo ventas este día."
        columnas={['N°', 'Cliente', 'Estado', 'Valor']}
        filas={p.remisiones.map((r) => [r.numero, r.cliente, r.pagada ? 'Cobrada' : 'Crédito', formatCOP(r.total)])}
        total={ventas}
      />
      <Detalle
        titulo="2. Gastos"
        vacio="No hubo gastos este día."
        columnas={['Concepto', 'Categoría', 'Medio de pago', 'Valor']}
        filas={p.gastos.map((g) => [g.concepto, g.categoria, g.medioPago, formatCOP(g.monto)])}
        total={gastos}
      />
      <Detalle
        titulo="3. Compras a proveedores"
        vacio="No hubo compras este día."
        columnas={['Proveedor', 'N° factura', 'Estado', 'Valor']}
        filas={p.compras.map((c) => [c.proveedor, c.numeroFactura, c.pagada ? 'Pagada' : 'Crédito', formatCOP(c.monto)])}
        total={p.compras.reduce((a, c) => a + c.monto, 0)}
      />

      <div className="mb-6 break-inside-avoid">
        <p className="font-bold uppercase mb-1">Observaciones</p>
        <div className="border border-black rounded p-2 min-h-[40px] whitespace-pre-wrap">
          {p.observaciones || 'Sin observaciones.'}
        </div>
        {p.guardado && (
          <p className="mt-1 text-[10px] text-[#475569]">
            Cierre guardado por {p.guardado.por} el {p.guardado.el}
          </p>
        )}
      </div>

      {/* Firmas */}
      <div className="grid grid-cols-2 gap-12 mt-12 break-inside-avoid">
        <div className="border-t border-black pt-1 text-center">Entregó (cajero)</div>
        <div className="border-t border-black pt-1 text-center">Recibió / revisó</div>
      </div>
    </div>
  );
}

function Detalle({ titulo, vacio, columnas, filas, total }: {
  titulo: string;
  vacio: string;
  columnas: string[];
  filas: string[][];
  total: number;
}) {
  return (
    <div className="mb-4">
      <p className="font-bold uppercase mb-1">{titulo}</p>
      {filas.length === 0 ? (
        <p className="text-[#475569] italic">{vacio}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              {columnas.map((c, i) => (
                <th key={c} className={`py-1 pr-2 ${i === columnas.length - 1 ? 'text-right' : ''}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-[#cbd5e1] break-inside-avoid">
                {f.map((celda, j) => (
                  <td key={j} className={`py-0.5 pr-2 ${j === f.length - 1 ? 'text-right tabular-nums' : ''}`}>
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-bold">
              <td className="pt-1" colSpan={columnas.length - 1}>Total</td>
              <td className="pt-1 text-right tabular-nums">{formatCOP(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
