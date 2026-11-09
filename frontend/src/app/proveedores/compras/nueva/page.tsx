'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FileCode, Upload, ArrowLeft, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails, reportSecurityMetric } from '@/lib/api';
import { formatCOP } from '@/lib/format';
import { fechaLocalHoy, leerOrigenCierre, rutaCierre } from '@/lib/cierre-diario';

const MAX_XML_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB según directrices de seguridad (RFC 9110 §413)

interface LineaCompra {
  clave: string;
  idProducto: string | null;
  codigo?: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  pctDescuento: number;
  pctIva: number;
}

const redondear = (v: number) => Math.round(v * 100) / 100;

export default function NuevaCompraPage() {
  const router = useRouter();
  const { success } = useToast();

  const [idempotencyKey] = useState(crypto.randomUUID());

  // Archivo XML UBL 2.1
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [isReadingXml, setIsReadingXml] = useState(false);
  const [xmlError, setXmlError] = useState<ProblemDetails | null>(null);
  const [advertenciasXml, setAdvertenciasXml] = useState<string[]>([]);

  // Formulario de Compra
  const [idProveedor, setIdProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaEmision, setFechaEmision] = useState(fechaLocalHoy());
  const [idBodega, setIdBodega] = useState('');
  const [pctRetefuente, setPctRetefuente] = useState('2.5');
  const [pctReteIva, setPctReteIva] = useState('15');
  const [tarifaReteIcaPorMil, setTarifaReteIcaPorMil] = useState('9.66');
  const [submitError, setSubmitError] = useState<ProblemDetails | null>(null);

  // Las compras se pagan de contado por defecto (queda PAGADA, sin cuenta por pagar)
  const [pagadaDeContado, setPagadaDeContado] = useState(true);
  const [idMetodoPago, setIdMetodoPago] = useState('');

  // Si viene del Cierre Diario, la compra toma la fecha del cierre y vuelve a él al registrar
  const [fechaCierreOrigen, setFechaCierreOrigen] = useState<string | null>(null);
  useEffect(() => {
    const fecha = leerOrigenCierre();
    setFechaCierreOrigen(fecha);
    if (fecha) setFechaEmision(fecha);
  }, []);

  // Ítems de la compra
  const [items, setItems] = useState<LineaCompra[]>([]);
  const [prodSearch, setProdSearch] = useState('');

  // Catálogos
  const { data: proveedores = [] } = useQuery<any[]>({
    queryKey: ['proveedores-select'],
    queryFn: () => api<any>('/proveedores?limit=100').then((r) => r.data || r),
  });

  const { data: bodegas = [] } = useQuery<any[]>({
    queryKey: ['bodegas'],
    queryFn: () => api<any[]>('/bodegas'),
  });

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

  const { data: prodsEncontrados = [] } = useQuery<any[]>({
    queryKey: ['buscar-prods-compra', prodSearch],
    queryFn: () => api<any[]>(`/productos/buscar?q=${encodeURIComponent(prodSearch.trim())}`),
    enabled: prodSearch.trim().length >= 2,
  });

  const agregarProducto = (p: any) => {
    setItems((prev) => {
      const existente = prev.find((it) => it.idProducto === p.id);
      if (existente) {
        return prev.map((it) => (it === existente ? { ...it, cantidad: it.cantidad + 1 } : it));
      }
      return [
        ...prev,
        {
          clave: crypto.randomUUID(),
          idProducto: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          cantidad: 1,
          costoUnitario: 0,
          pctDescuento: 0,
          pctIva: p.impuesto?.porcentaje != null ? Number(p.impuesto.porcentaje) : 19,
        },
      ];
    });
    setProdSearch('');
  };

  const actualizarLinea = (clave: string, cambios: Partial<LineaCompra>) =>
    setItems((prev) => prev.map((it) => (it.clave === clave ? { ...it, ...cambios } : it)));

  // Totales (mismo cálculo que el backend: retenciones sobre la base sin IVA)
  const base = redondear(
    items.reduce((acc, it) => acc + it.cantidad * it.costoUnitario * (1 - (it.pctDescuento || 0) / 100), 0),
  );
  const iva = redondear(
    items.reduce(
      (acc, it) => acc + it.cantidad * it.costoUnitario * (1 - (it.pctDescuento || 0) / 100) * (it.pctIva / 100),
      0,
    ),
  );
  const retefuente = redondear(base * ((parseFloat(pctRetefuente) || 0) / 100));
  const reteiva = redondear(iva * ((parseFloat(pctReteIva) || 0) / 100));
  const reteica = redondear(base * ((parseFloat(tarifaReteIcaPorMil) || 0) / 1000));
  const total = redondear(base + iva - retefuente - reteiva - reteica);

  const lineasSinProducto = items.filter((it) => !it.idProducto).length;
  const lineasSinCosto = items.filter((it) => it.cantidad <= 0 || it.costoUnitario <= 0).length;
  const puedeRegistrar =
    !!idProveedor && !!numeroFactura.trim() && items.length > 0 && lineasSinProducto === 0 && lineasSinCosto === 0;

  // Leer y precargar XML UBL 2.1 (POST /facturas-compra/importar-xml)
  const handleUploadXml = async (file: File) => {
    setIsReadingXml(true);
    setXmlError(null);
    setAdvertenciasXml([]);

    // Validación preventiva en cliente: Tipo de archivo seguro (RFC 9110 §415)
    const isXmlExtension = file.name.toLowerCase().endsWith('.xml');
    const isXmlMime = file.type === 'text/xml' || file.type === 'application/xml' || file.type === '';
    if (!isXmlExtension || !isXmlMime) {
      const problem: ProblemDetails = {
        type: 'https://api.crmcontable.com/errors/unsupported-media-type',
        title: 'Formato de archivo no soportado',
        status: 415,
        detail: 'El archivo seleccionado no es un XML válido. Solo se admiten facturas en formato XML UBL 2.1.',
        instance: '/proveedores/compras/nueva',
      };
      setXmlError(problem);
      setIsReadingXml(false);
      reportSecurityMetric({
        type: 'UNSAFE_UPLOAD',
        path: '/facturas-compra/importar-xml',
        status: 415,
        detail: `Intento de carga de archivo no XML: ${file.name} (${file.type})`,
      });
      return;
    }

    // Validación preventiva en cliente: Tamaño máximo (RFC 9110 §413)
    if (file.size > MAX_XML_SIZE_BYTES) {
      const problem: ProblemDetails = {
        type: 'https://api.crmcontable.com/errors/payload-too-large',
        title: 'Archivo demasiado grande',
        status: 413,
        detail: `El archivo supera el tamaño máximo permitido de 5 MB (tamaño actual: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
        instance: '/proveedores/compras/nueva',
      };
      setXmlError(problem);
      setIsReadingXml(false);
      reportSecurityMetric({
        type: 'UNSAFE_UPLOAD',
        path: '/facturas-compra/importar-xml',
        status: 413,
        detail: `Archivo XML excede límite de 5 MB: ${file.size} bytes`,
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const res = await api<{ precarga: any; advertencias?: string[] }>('/facturas-compra/importar-xml', {
        method: 'POST',
        body: formData,
      });

      if (res.precarga) {
        if (res.precarga.idProveedor) setIdProveedor(res.precarga.idProveedor);
        if (res.precarga.numeroFactura) setNumeroFactura(res.precarga.numeroFactura);
        if (res.precarga.fechaEmision && !fechaCierreOrigen) setFechaEmision(res.precarga.fechaEmision.slice(0, 10));
        if (res.precarga.items?.length) {
          setItems(
            res.precarga.items.map((it: any) => ({
              clave: crypto.randomUUID(),
              idProducto: it.idProducto,
              codigo: it.productoEncontrado?.codigo || it.codigoProveedor,
              nombre: it.productoEncontrado?.nombre || it.descripcion,
              cantidad: Number(it.cantidad) || 0,
              costoUnitario: Number(it.costoUnitario) || 0,
              pctDescuento: Number(it.pctDescuento) || 0,
              pctIva: Number(it.pctIva) || 0,
            })),
          );
        }
        setAdvertenciasXml(res.advertencias || []);
        success('XML UBL 2.1 Precargado', 'Los datos del proveedor y líneas de factura han sido importados.');
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setXmlError(err.problem);
      }
    } finally {
      setIsReadingXml(false);
    }
  };

  // Registrar Compra (POST /facturas-compra)
  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        idProveedor,
        numeroFactura: numeroFactura.trim(),
        fechaEmision,
        idBodega: idBodega || bodegas[0]?.id,
        pctRetefuente: parseFloat(pctRetefuente) || 0,
        pctReteIva: parseFloat(pctReteIva) || 0,
        tarifaReteIcaPorMil: parseFloat(tarifaReteIcaPorMil) || 0,
        pagadaDeContado,
        idMetodoPago: pagadaDeContado ? idMetodoPago || undefined : undefined,
        items: items.map((it) => ({
          idProducto: it.idProducto,
          cantidad: Number(it.cantidad),
          costoUnitario: Number(it.costoUnitario),
          pctDescuento: Number(it.pctDescuento || 0),
          pctIva: Number(it.pctIva || 0),
        })),
      };

      return api('/facturas-compra', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      success(
        pagadaDeContado ? 'Compra registrada y pagada' : 'Compra registrada a crédito',
        pagadaDeContado
          ? `Factura ${numeroFactura} pagada de contado. Se generó la entrada a inventario.`
          : `Factura ${numeroFactura} registrada. Se generó la entrada a inventario y la cuenta por pagar.`,
      );
      router.push(fechaCierreOrigen ? rutaCierre(fechaCierreOrigen) : '/proveedores');
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setSubmitError(err.problem);
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 pb-4 border-b border-[#e2e8f0]">
          <Link href={fechaCierreOrigen ? rutaCierre(fechaCierreOrigen) : '/proveedores'}>
            <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">Registrar Factura de Compra</h1>
            <p className="text-xs text-[#64748b]">
              Carga automática mediante XML UBL 2.1 o diligenciamiento manual
            </p>
            {fechaCierreOrigen && (
              <p className="text-xs font-semibold text-emerald-700">
                Para el cierre diario del {fechaCierreOrigen}: al registrarla volverá al cierre.
              </p>
            )}
          </div>
        </div>

        {submitError && <BannerError error={submitError} status={submitError.status} />}

        {/* Zona Carga de XML UBL 2.1 */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-[#1d63ed]" />
            <h3 className="text-sm font-semibold text-[#0f172a]">Importar XML Factura Electrónica (opcional)</h3>
          </div>

          {xmlError && (
            <BannerError
              error={xmlError}
              status={xmlError.status}
              rceAction={{
                label: 'Continuar en Formulario Manual',
                onClick: () => setXmlError(null),
              }}
            />
          )}

          <div className="border-2 border-dashed border-[#cbd5e1] rounded-xl p-5 text-center hover:bg-[#f8fafc] transition-colors">
            <input
              type="file"
              accept=".xml"
              id="xmlInput"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setXmlFile(file);
                  handleUploadXml(file);
                }
              }}
            />
            <label htmlFor="xmlInput" className="cursor-pointer flex flex-col items-center gap-2">
              <Upload className="w-7 h-7 text-[#64748b]" />
              <span className="text-xs font-semibold text-[#0f172a]">
                {xmlFile ? xmlFile.name : 'Haz clic para seleccionar el archivo XML de la factura'}
              </span>
              <span className="text-[11px] text-[#64748b]">
                {isReadingXml ? 'Extrayendo datos de la factura...' : 'Si no tienes el XML, llena los datos abajo'}
              </span>
            </label>
          </div>

          {advertenciasXml.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              {advertenciasXml.map((a) => (
                <p key={a}>• {a}</p>
              ))}
            </div>
          )}
        </div>

        {/* Datos de la factura */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
            1. Datos de la Factura de Compra
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Proveedor *</label>
              <select
                value={idProveedor}
                onChange={(e) => setIdProveedor(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
              >
                <option value="">Selecciona proveedor</option>
                {proveedores.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.tercero?.razonSocial || p.razonSocial} ({p.tercero?.numeroDocumento || p.numeroDocumento})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Número de Factura del Proveedor *"
              placeholder="Ej. HZ-2048"
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
            />

            <Input
              label="Fecha de Emisión *"
              type="date"
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Bodega de Entrada *</label>
              <select
                value={idBodega}
                onChange={(e) => setIdBodega(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
              >
                {bodegas.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Repuestos comprados */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
            2. Repuestos Comprados *
          </span>

          <div className="relative">
            <Input
              placeholder="Buscar repuesto por código o nombre para agregarlo..."
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              leftIcon={<Plus className="w-4 h-4" />}
            />
            {prodsEncontrados.length > 0 && prodSearch.trim().length >= 2 && (
              <div className="absolute z-30 mt-1 w-full border border-[#e2e8f0] rounded-md divide-y divide-[#f1f5f9] max-h-60 overflow-y-auto bg-white shadow-xl">
                {prodsEncontrados.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    className="p-2.5 hover:bg-[#eff4ff] cursor-pointer text-xs flex justify-between items-center"
                  >
                    <div>
                      <span className="font-semibold text-[#0f172a]">{p.codigo}</span>
                      <span className="text-[#334155] ml-2">{p.nombre}</span>
                    </div>
                    <span className="text-[11px] text-[#64748b] whitespace-nowrap">Stock: {p.disponible ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748b] border border-dashed border-[#cbd5e1] rounded-lg">
              Busca un repuesto arriba para agregarlo a la compra.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Repuesto</th>
                    <th className="py-2.5 px-3 w-24">Cantidad</th>
                    <th className="py-2.5 px-3 w-36">Costo unit. (sin IVA)</th>
                    <th className="py-2.5 px-3 w-20">Desc. %</th>
                    <th className="py-2.5 px-3 w-20">IVA %</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {items.map((it) => (
                    <tr key={it.clave} className={!it.idProducto ? 'bg-amber-50' : ''}>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-[#0f172a] block">{it.codigo || '—'}</span>
                        <span className="text-[#64748b]">{it.nombre}</span>
                        {!it.idProducto && (
                          <span className="flex items-center gap-1 text-amber-700 font-medium mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> No existe en el catálogo: quítala y búscala arriba
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          value={it.cantidad}
                          onChange={(e) => actualizarLinea(it.clave, { cantidad: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          value={it.costoUnitario}
                          onChange={(e) => actualizarLinea(it.clave, { costoUnitario: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          value={it.pctDescuento}
                          onChange={(e) =>
                            actualizarLinea(it.clave, { pctDescuento: Math.min(100, parseFloat(e.target.value) || 0) })
                          }
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          value={it.pctIva}
                          onChange={(e) => actualizarLinea(it.clave, { pctIva: Math.min(100, parseFloat(e.target.value) || 0) })}
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">
                        {formatCOP(it.cantidad * it.costoUnitario * (1 - (it.pctDescuento || 0) / 100))}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((x) => x.clave !== it.clave))}
                          className="text-[#ef4444] hover:text-[#dc2626] p-1"
                          title="Quitar línea"
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

        {/* Retenciones, pago y totales */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-5">
          <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
            3. Retenciones, Pago y Total
          </span>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="ReteFuente (%)"
              type="number"
              min={0}
              value={pctRetefuente}
              onChange={(e) => setPctRetefuente(e.target.value)}
            />
            <Input
              label="ReteIVA (%)"
              type="number"
              min={0}
              value={pctReteIva}
              onChange={(e) => setPctReteIva(e.target.value)}
            />
            <Input
              label="ReteICA (‰ por mil)"
              type="number"
              min={0}
              value={tarifaReteIcaPorMil}
              onChange={(e) => setTarifaReteIcaPorMil(e.target.value)}
              helperText="Tarifa en por mil (ej. 9.66)"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">Forma de pago</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPagadaDeContado(true)}
                  className={`py-2 text-xs font-semibold rounded-md border ${
                    pagadaDeContado
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                      : 'bg-white border-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  Pagada de contado
                </button>
                <button
                  type="button"
                  onClick={() => setPagadaDeContado(false)}
                  className={`py-2 text-xs font-semibold rounded-md border ${
                    !pagadaDeContado
                      ? 'bg-slate-100 border-slate-400 text-slate-700'
                      : 'bg-white border-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  A crédito
                </button>
              </div>
              {pagadaDeContado ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#64748b] uppercase">Medio de pago</label>
                  <select
                    value={idMetodoPago}
                    onChange={(e) => setIdMetodoPago(e.target.value)}
                    className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md"
                  >
                    {mediosPago.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#64748b]">
                    Se registra el pago por el total: la compra queda pagada y sale de caja ese día.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-[#64748b]">Queda como cuenta por pagar al proveedor.</p>
              )}
            </div>

            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-4 text-xs space-y-1.5 tabular-nums">
              <div className="flex justify-between"><span>Subtotal (sin IVA)</span><span>{formatCOP(base)}</span></div>
              <div className="flex justify-between"><span>IVA</span><span>{formatCOP(iva)}</span></div>
              {retefuente > 0 && (
                <div className="flex justify-between text-[#64748b]"><span>(−) ReteFuente</span><span>{formatCOP(retefuente)}</span></div>
              )}
              {reteiva > 0 && (
                <div className="flex justify-between text-[#64748b]"><span>(−) ReteIVA</span><span>{formatCOP(reteiva)}</span></div>
              )}
              {reteica > 0 && (
                <div className="flex justify-between text-[#64748b]"><span>(−) ReteICA</span><span>{formatCOP(reteica)}</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-[#e2e8f0] text-sm font-bold text-[#0f172a]">
                <span>{pagadaDeContado ? 'Total a pagar hoy' : 'Total a pagar'}</span>
                <span>{formatCOP(total)}</span>
              </div>
            </div>
          </div>

          {(lineasSinProducto > 0 || lineasSinCosto > 0) && (
            <p className="text-xs text-amber-700">
              {lineasSinProducto > 0 && 'Hay líneas sin producto del catálogo. '}
              {lineasSinCosto > 0 && 'Todas las líneas deben tener cantidad y costo mayores que cero.'}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              className="h-10 px-6 font-semibold"
              isLoading={submitMutation.isPending}
              disabled={!puedeRegistrar}
              onClick={() => submitMutation.mutate()}
            >
              {pagadaDeContado ? 'Registrar Compra Pagada' : 'Registrar Compra a Crédito'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
