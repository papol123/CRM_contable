'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Receipt,
  Plus,
  Trash2,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  CreditCard,
  User,
  Package,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { BannerError } from '@/components/ui/BannerError';
import { useToast } from '@/components/ui/Toast';
import { fechaLocalHoy, leerOrigenCierre, rutaCierre, sumarDiasISO } from '@/lib/cierre-diario';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { formatCOP } from '@/lib/format';

interface ItemVenta {
  idProducto: string;
  codigo?: string;
  nombre?: string;
  cantidad: number;
  valorUnitario: number;
  pctDescuento: number;
  pctIva: number;
  ivaIncluido?: boolean;
  precioOriginal?: number;
  disponible?: number;
}

const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';

export default function NuevaRemisionPage() {
  const router = useRouter();
  const { success } = useToast();

  // Si viene del Cierre Diario, la remisión toma la fecha del cierre y vuelve a él al emitir
  const [fechaCierreOrigen, setFechaCierreOrigen] = useState<string | null>(null);
  useEffect(() => {
    setFechaCierreOrigen(leerOrigenCierre());
  }, []);

  // Clave de idempotencia única para este borrador (Regla §1.5)
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [selectedBodegaId, setSelectedBodegaId] = useState('');
  const [condicionPago, setCondicionPago] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [idMetodoPago, setIdMetodoPago] = useState('');
  const { data: mediosPago = [] } = useQuery<{ id: string; codigo: string; nombre: string }[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api('/medios-pago'),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!idMetodoPago && mediosPago.length) {
      setIdMetodoPago((mediosPago.find((m) => m.codigo === 'EFECTIVO') || mediosPago[0]).id);
    }
  }, [mediosPago, idMetodoPago]);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [observaciones, setObservaciones] = useState('');

  // Repuesto temporal para agregar
  const [prodSearch, setProdSearch] = useState('');
  const [selectedProd, setSelectedProd] = useState<any | null>(null);
  const [itemCant, setItemCant] = useState(1);
  const [itemPrecio, setItemPrecio] = useState(0);
  const [ivaIncluido, setIvaIncluido] = useState<boolean>(true);

  // Totales simulados con /calcular
  const [simulacion, setSimulacion] = useState<{
    subtotalNeto?: number;
    totalIva?: number;
    totalRetefuente?: number;
    total?: number;
  }>({});

  const [calculating, setCalculating] = useState(false);
  const [submitError, setSubmitError] = useState<ProblemDetails | null>(null);

  // Inicializar Idempotency-Key y recuperar borrador local (Pilar RCE)
  useEffect(() => {
    let key = '';
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('borrador:remision:current_key');
      if (storedKey) {
        key = storedKey;
      } else {
        key = crypto.randomUUID();
        localStorage.setItem('borrador:remision:current_key', key);
      }
    }
    setIdempotencyKey(key);
  }, []);

  // Catálogos
  const { data: bodegas = [] } = useQuery<any[]>({
    queryKey: ['bodegas'],
    queryFn: () => api<any[]>('/bodegas'),
  });

  // Búsqueda de clientes
  const { data: clientesEncontrados = [] } = useQuery<any[]>({
    queryKey: ['buscar-clientes-venta', clienteSearch],
    queryFn: () => api<any[]>(`/clientes/buscar?q=${encodeURIComponent(clienteSearch)}`),
    enabled: clienteSearch.length >= 2,
  });

  // Cliente por defecto: Consumidor final (documento 222222222222, migración 008)
  const { data: consumidorFinal } = useQuery<any | null>({
    queryKey: ['cliente-consumidor-final'],
    queryFn: async () => {
      const lista = await api<any[]>(`/clientes/buscar?q=${DOCUMENTO_CONSUMIDOR_FINAL}`);
      return lista.find((c) => c.numeroDocumento === DOCUMENTO_CONSUMIDOR_FINAL) ?? null;
    },
    staleTime: Infinity,
  });
  const clienteDefectoAplicado = useRef(false);
  useEffect(() => {
    if (consumidorFinal && !clienteDefectoAplicado.current) {
      clienteDefectoAplicado.current = true;
      setSelectedCliente((actual: any) => actual ?? consumidorFinal);
    }
  }, [consumidorFinal]);
  const esConsumidorFinal = selectedCliente?.numeroDocumento === DOCUMENTO_CONSUMIDOR_FINAL;
  // A Consumidor final se le puede fiar, anotando quién queda debiendo (aparece en Deudores)
  const [nombreDeudor, setNombreDeudor] = useState('');
  const faltaNombreDeudor = esConsumidorFinal && condicionPago === 'CREDITO' && !nombreDeudor.trim();

  // Búsqueda de productos por código o nombre
  const { data: prodsEncontrados = [] } = useQuery<any[]>({
    queryKey: ['buscar-prods-venta', prodSearch],
    queryFn: () => api<any[]>(`/productos/buscar?q=${encodeURIComponent(prodSearch.trim())}`),
    enabled:
      prodSearch.trim().length >= 2 &&
      (!selectedProd || prodSearch !== `${selectedProd.codigo} — ${selectedProd.nombre}`),
  });

  // Cálculo en tiempo real
  useEffect(() => {
    if (items.length === 0) {
      setSimulacion({
        subtotalNeto: 0,
        totalIva: 0,
        totalRetefuente: 0,
        total: 0,
      });
      return;
    }

    // Cálculo inmediato en frontend para respuesta instantánea
    const subLocal = items.reduce(
      (acc, it) => acc + it.cantidad * it.valorUnitario * (1 - (it.pctDescuento || 0) / 100),
      0,
    );
    const ivaLocal = items.reduce((acc, it) => {
      const base = it.cantidad * it.valorUnitario * (1 - (it.pctDescuento || 0) / 100);
      return acc + (base * (it.pctIva ?? 19)) / 100;
    }, 0);
    const totalLocal = subLocal + ivaLocal;

    setSimulacion({
      subtotalNeto: subLocal,
      totalIva: ivaLocal,
      totalRetefuente: 0,
      total: totalLocal,
    });

    // Sincronización con backend /facturas-venta/calcular
    const timer = setTimeout(async () => {
      setCalculating(true);
      try {
        const payload = {
          items: items.map((it) => ({
            idProducto: it.idProducto,
            cantidad: it.cantidad,
            valorUnitario: it.valorUnitario,
            pctDescuento: it.pctDescuento || 0,
            pctIva: it.pctIva ?? 19,
          })),
          porcentajeRetefuente: 0,
        };
        const res = await api<any>('/facturas-venta/calcular', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const totalCalculado =
          res.total ?? res.totalPagar ?? ((res.subtotalNeto ?? subLocal) + (res.totalIva ?? ivaLocal));
        setSimulacion({
          subtotalNeto: res.subtotalNeto ?? subLocal,
          totalIva: res.totalIva ?? ivaLocal,
          totalRetefuente: res.retefuente ?? 0,
          total: totalCalculado,
        });
      } catch (err) {
        console.warn('Cálculo backend no disponible, usando cálculo local:', err);
      } finally {
        setCalculating(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [items]);

  const handleAddItem = () => {
    if (!selectedProd) return;
    const precioIngresado =
      itemPrecio > 0 ? itemPrecio : selectedProd.precioVenta || selectedProd.precio || 0;
    const pctIva = selectedProd.impuesto?.porcentaje ? Number(selectedProd.impuesto.porcentaje) : 19;

    // Si IVA está incluido, desglosamos la base imponible: base = precioIngresado / (1 + pctIva/100)
    const valorUnitarioBase = ivaIncluido
      ? Math.round((precioIngresado / (1 + pctIva / 100)) * 100) / 100
      : precioIngresado;

    const newItem: ItemVenta = {
      idProducto: selectedProd.id || selectedProd.idProducto,
      codigo: selectedProd.codigo,
      nombre: selectedProd.nombre || selectedProd.descripcion,
      cantidad: itemCant,
      valorUnitario: valorUnitarioBase,
      pctDescuento: 0,
      pctIva: pctIva,
      ivaIncluido: ivaIncluido,
      precioOriginal: precioIngresado,
      disponible: selectedProd.disponible ?? selectedProd.saldoTotal,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedProd(null);
    setProdSearch('');
    setItemCant(1);
    setItemPrecio(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Enviar Remisión
  const submitMutation = useMutation({
    mutationFn: async () => {
      const fechaDocumento = fechaCierreOrigen || fechaLocalHoy();
      // Si es crédito: 30 días posteriores a la expedición
      const vencimiento = condicionPago === 'CONTADO' ? fechaDocumento : sumarDiasISO(fechaDocumento, 30);

      const payload = {
        idCliente: selectedCliente.id,
        idBodega: selectedBodegaId || (bodegas[0]?.id ?? ''),
        ...(fechaCierreOrigen ? { fechaExpedicion: fechaCierreOrigen } : {}),
        fechaVencimiento: vencimiento,
        items: items.map((it) => ({
          idProducto: it.idProducto,
          cantidad: it.cantidad,
          valorUnitario: it.valorUnitario,
          pctDescuento: it.pctDescuento,
          pctIva: it.pctIva,
        })),
        observaciones: observaciones.trim() || undefined,
        // De contado: el cobro se registra junto con la remisión (queda PAGADA)
        pagadaDeContado: condicionPago === 'CONTADO',
        nombreDeudor: condicionPago === 'CREDITO' && esConsumidorFinal ? nombreDeudor.trim() : undefined,
        idMetodoPago: condicionPago === 'CONTADO' ? idMetodoPago || undefined : undefined,
      };

      return api<{ id: string; numeroVenta: string; total: number }>('/facturas-venta', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      success(`Remisión ${data.numeroVenta || 'emitida'}`, 'El documento ha sido creado exitosamente.');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('borrador:remision:current_key');
      }
      router.push(fechaCierreOrigen ? rutaCierre(fechaCierreOrigen) : '/facturacion/ventas');
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setSubmitError(err.problem);
      }
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-3">
            <Link href="/facturacion/ventas">
              <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">Nueva Remisión de Venta</h1>
              {fechaCierreOrigen && (
                <p className="text-xs font-semibold text-emerald-700">
                  Para el cierre diario del {fechaCierreOrigen}: se emitirá con esa fecha y volverá al cierre.
                </p>
              )}
              <p className="text-xs text-[#64748b]">
                Documento de salida comercial con reserva de inventario
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#64748b] bg-[#f8fafc] px-2.5 py-1 rounded-md border border-[#e2e8f0]">
              Clave Idempotencia: {idempotencyKey.substring(0, 8)}...
            </span>
          </div>
        </div>

        {/* Banner de error RCE */}
        {submitError && (
          <BannerError
            error={submitError}
            status={submitError.status}
            rceAction={
              submitError.status === 422 && submitError.type?.includes('credito-bloqueado')
                ? {
                  label: 'Cambiar a Contado y Reemitir',
                  onClick: () => {
                    setCondicionPago('CONTADO');
                    setIdempotencyKey(crypto.randomUUID());
                    setSubmitError(null);
                  },
                }
                : undefined
            }
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario Principal (Cliente, ítems) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Selección de Cliente */}
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card space-y-3">
              <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
                1. Datos del Cliente *
              </span>

              {selectedCliente ? (
                <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-[#0f172a]">{selectedCliente.razonSocial}</h4>
                    <p className="text-xs text-[#64748b]">NIT / CC: {selectedCliente.numeroDocumento}</p>
                    {selectedCliente.creditoBloqueado && (
                      <Badge variant="error" className="mt-1">
                        Crédito Bloqueado
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedCliente(null)}>
                    {esConsumidorFinal ? 'Facturar a un cliente' : 'Cambiar Cliente'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Buscar cliente por nombre o documento..."
                    value={clienteSearch}
                    onChange={(e) => setClienteSearch(e.target.value)}
                    helperText="Escribe al menos 2 caracteres para buscar en el directorio"
                  />
                  {consumidorFinal && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCliente(consumidorFinal);
                        setClienteSearch('');
                      }}
                      className="text-xs text-[#1d63ed] hover:underline"
                    >
                      Usar Consumidor final
                    </button>
                  )}
                  {clientesEncontrados.length > 0 && (
                    <div className="border border-[#e2e8f0] rounded-md divide-y divide-[#f1f5f9] max-h-40 overflow-y-auto bg-white shadow-sm">
                      {clientesEncontrados.map((cli) => (
                        <div
                          key={cli.id}
                          onClick={() => {
                            setSelectedCliente(cli);
                            setClienteSearch('');
                            if (cli.creditoBloqueado) {
                              setCondicionPago('CONTADO');
                            }
                          }}
                          className="p-2.5 hover:bg-[#eff4ff] cursor-pointer text-xs flex justify-between items-center"
                        >
                          <div>
                            <span className="font-semibold text-[#0f172a] block">{cli.razonSocial}</span>
                            <span className="text-[11px] text-[#64748b]">{cli.numeroDocumento}</span>
                          </div>
                          {cli.creditoBloqueado && <Badge variant="error">Bloqueado</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Agregar Repuestos */}
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card space-y-4">
              <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
                2. Repuestos a Facturar *
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                <div className="sm:col-span-2 space-y-1 relative">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-semibold text-[#64748b] uppercase">
                      Repuesto (Código o Nombre)
                    </label>
                    {selectedProd && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProd(null);
                          setProdSearch('');
                          setItemPrecio(0);
                        }}
                        className="text-[10px] text-[#1d63ed] hover:underline"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="Buscar por código o nombre (ej. Pastillas, FIL-01)..."
                    value={prodSearch}
                    onChange={(e) => {
                      setProdSearch(e.target.value);
                      if (selectedProd) setSelectedProd(null);
                    }}
                  />
                  {prodsEncontrados.length > 0 && !selectedProd && (
                    <div className="border border-[#e2e8f0] rounded-md divide-y divide-[#f1f5f9] max-h-56 overflow-y-auto bg-white shadow-xl absolute z-30 w-full sm:w-[420px] mt-1 left-0">
                      {prodsEncontrados.map((p) => {
                        const precioProducto =
                          p.precioVenta ??
                          p.precio ??
                          (p.precios?.[0]?.precio ? Number(p.precios[0].precio) : 0);
                        const stockActual = p.disponible ?? p.saldoTotal ?? 0;
                        return (
                          <div
                            key={p.id || p.idProducto}
                            onClick={() => {
                              setSelectedProd(p);
                              setItemPrecio(precioProducto);
                              setProdSearch(`${p.codigo} — ${p.nombre || ''}`);
                            }}
                            className="p-2.5 hover:bg-[#eff4ff] cursor-pointer text-xs flex justify-between items-center transition-colors"
                          >
                            <div className="flex flex-col pr-2">
                              <span className="font-semibold text-[#0f172a]">{p.codigo}</span>
                              <span className="text-[#334155] font-medium">{p.nombre}</span>
                              <span className="text-[11px] text-[#64748b]">
                                {p.categoria?.nombre ? `${p.categoria.nombre} • ` : ''}Precio: {formatCOP(precioProducto)}
                              </span>
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${stockActual > 0
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                  }`}
                              >
                                Stock: {stockActual}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase">Cantidad</label>
                  <Input
                    type="number"
                    min={1}
                    value={itemCant}
                    onChange={(e) => setItemCant(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase">Precio Unit. (COP)</label>
                  <Input
                    type="number"
                    min={0}
                    value={itemPrecio}
                    onChange={(e) => setItemPrecio(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                  {itemPrecio > 0 && (() => {
                    const pct = selectedProd?.impuesto?.porcentaje ? Number(selectedProd.impuesto.porcentaje) : 19;
                    return (
                      <p className="text-[10px] text-[#64748b] truncate">
                        {ivaIncluido
                          ? `Base: ${formatCOP(Math.round((itemPrecio / (1 + pct / 100)) * 100) / 100)}`
                          : `+IVA (${pct}%): ${formatCOP(Math.round((itemPrecio * pct) / 100))}`}
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase">Modo IVA</label>
                  <button
                    type="button"
                    onClick={() => setIvaIncluido(!ivaIncluido)}
                    className={`w-full h-[38px] px-2 text-xs font-semibold rounded-md border flex items-center justify-center gap-1.5 transition-all ${
                      ivaIncluido
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                    title={
                      ivaIncluido
                        ? 'El precio digitado ya incluye IVA (se desglosará la base automáticamente)'
                        : 'Al precio digitado se le sumará el IVA adicionalmente'
                    }
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ivaIncluido ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span>{ivaIncluido ? 'IVA Incluido' : '+ Más IVA'}</span>
                  </button>
                </div>

                <Button
                  variant="secondary"
                  onClick={handleAddItem}
                  disabled={!selectedProd || itemPrecio <= 0}
                  className="h-[38px]"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {/* Tabla de ítems agregados */}
              {items.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-[#cbd5e1] rounded-lg text-xs text-[#64748b]">
                  Agrega al menos un repuesto para calcular los totales de la remisión.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Descripción</th>
                        <th className="py-2.5 px-3 text-right">Cant.</th>
                        <th className="py-2.5 px-3 text-right">V. Unitario</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 font-semibold text-[#0f172a]">{it.codigo}</td>
                          <td className="py-2.5 px-3 text-[#424655]">
                            <span>{it.nombre}</span>
                            {it.ivaIncluido && (
                              <span className="ml-1.5 text-[10px] text-emerald-600 font-medium">
                                (IVA incl.)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium tabular-nums">{it.cantidad}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <div>{formatCOP(it.valorUnitario)}</div>
                            {it.ivaIncluido && it.precioOriginal && (
                              <div className="text-[10px] text-[#64748b]">
                                Orig: {formatCOP(it.precioOriginal)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#0f172a] tabular-nums">
                            {formatCOP(it.cantidad * it.valorUnitario)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleRemoveItem(idx)}
                              className="text-[#ef4444] hover:text-[#dc2626] p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Panel Lateral: Parámetros y Totales */}
          <div className="space-y-6">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card space-y-4">
              <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
                Condiciones de Venta
              </span>

              {/* Selector Bodega */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">Bodega de Despacho</label>
                <select
                  value={selectedBodegaId}
                  onChange={(e) => setSelectedBodegaId(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Condición de Pago */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase">Condición de Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCondicionPago('CONTADO')}
                    className={`py-2 text-xs font-semibold rounded-md border text-center transition-colors ${condicionPago === 'CONTADO'
                        ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]'
                        : 'bg-white border-[#e2e8f0] text-[#64748b]'
                      }`}
                  >
                    Contado (Hoy)
                  </button>
                  <button
                    type="button"
                    disabled={selectedCliente?.creditoBloqueado}
                    onClick={() => setCondicionPago('CREDITO')}
                    className={`py-2 text-xs font-semibold rounded-md border text-center transition-colors ${condicionPago === 'CREDITO'
                        ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]'
                        : 'bg-white border-[#e2e8f0] text-[#64748b] disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                  >
                    Crédito (30 días)
                  </button>
                </div>
                {condicionPago === 'CONTADO' && (
                  <div className="pt-2 space-y-1">
                    <label className="text-[11px] font-semibold text-[#64748b] uppercase">Medio de pago</label>
                    <select
                      value={idMetodoPago}
                      onChange={(e) => setIdMetodoPago(e.target.value)}
                      className="w-full h-[34px] px-2 bg-white text-xs border border-[#e2e8f0] rounded-md"
                    >
                      {mediosPago.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-[#64748b]">La remisión queda cobrada (sin saldo pendiente).</p>
                  </div>
                )}
                {condicionPago === 'CREDITO' && (
                  <div className="pt-2 space-y-1">
                    {esConsumidorFinal && (
                      <>
                        <label className="text-[11px] font-semibold text-[#64748b] uppercase">¿Quién queda debiendo? *</label>
                        <Input
                          placeholder="Nombre y teléfono"
                          value={nombreDeudor}
                          onChange={(e) => setNombreDeudor(e.target.value)}
                        />
                      </>
                    )}
                    <p className="text-[10px] text-amber-700">Queda a crédito por 30 días y aparece en Deudores.</p>
                  </div>
                )}
              </div>

              {/* Totales */}
              <div className="pt-3 border-t border-[#e2e8f0] space-y-2 text-xs">
                <div className="flex justify-between items-center text-[#64748b]">
                  <span>Subtotal:</span>
                  <span className="font-medium tabular-nums">
                    {formatCOP(simulacion.subtotalNeto ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#64748b]">
                  <span>IVA (19%):</span>
                  <span className="font-medium tabular-nums">
                    {formatCOP(simulacion.totalIva ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-[#e2e8f0] text-sm">
                  <span className="font-bold text-[#0f172a]">Total a Pagar:</span>
                  <span className="font-bold text-[#1d63ed] text-base tabular-nums">
                    {formatCOP(simulacion.total ?? 0)}
                  </span>
                </div>
              </div>

              {/* Botón Emitir */}
              <div className="pt-3">
                <Button
                  variant="primary"
                  className="w-full justify-center h-11 text-sm font-semibold"
                  isLoading={submitMutation.isPending}
                  disabled={!selectedCliente || items.length === 0 || faltaNombreDeudor}
                  onClick={() => submitMutation.mutate()}
                >
                  Emitir Remisión Interna
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
