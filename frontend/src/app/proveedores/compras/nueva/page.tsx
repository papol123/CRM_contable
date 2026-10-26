'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileCode,
  Upload,
  ArrowLeft,
  Building2,
  Package,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { formatCOP } from '@/lib/format';

export default function NuevaCompraPage() {
  const router = useRouter();
  const { success } = useToast();

  const [idempotencyKey] = useState(crypto.randomUUID());

  // Archivo XML UBL 2.1
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [isReadingXml, setIsReadingXml] = useState(false);
  const [xmlError, setXmlError] = useState<ProblemDetails | null>(null);

  // Formulario de Compra
  const [idProveedor, setIdProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [idBodega, setIdBodega] = useState('');
  const [pctRetefuente, setPctRetefuente] = useState('2.5');
  const [pctReteIva, setPctReteIva] = useState('15');
  const [tarifaReteIcaPorMil, setTarifaReteIcaPorMil] = useState('9.66');
  const [submitError, setSubmitError] = useState<ProblemDetails | null>(null);

  // Ítems de la compra
  const [items, setItems] = useState<any[]>([
    { idProducto: '', cantidad: 10, costoUnitario: 15000, pctDescuento: 0, pctIva: 19 },
  ]);

  // Catálogos
  const { data: proveedores = [] } = useQuery<any[]>({
    queryKey: ['proveedores-select'],
    queryFn: () => api<any>('/proveedores?limit=50').then((r) => r.data || r),
  });

  const { data: bodegas = [] } = useQuery<any[]>({
    queryKey: ['bodegas'],
    queryFn: () => api<any[]>('/bodegas'),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn: () => api<any>('/inventario?limit=100').then((r) => r.data || r),
  });

  // Leer y precargar XML UBL 2.1 (POST /facturas-compra/importar-xml)
  const handleUploadXml = async (file: File) => {
    setIsReadingXml(true);
    setXmlError(null);
    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const res = await api<{ precarga: any }>('/facturas-compra/importar-xml', {
        method: 'POST',
        body: formData,
      });

      if (res.precarga) {
        if (res.precarga.idProveedor) setIdProveedor(res.precarga.idProveedor);
        if (res.precarga.numeroFactura) setNumeroFactura(res.precarga.numeroFactura);
        if (res.precarga.items && res.precarga.items.length > 0) {
          setItems(res.precarga.items);
        }
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
        items: items.map((it) => ({
          idProducto: it.idProducto || productos[0]?.idProducto || productos[0]?.id,
          cantidad: Number(it.cantidad),
          costoUnitario: Number(it.costoUnitario),
          pctDescuento: Number(it.pctDescuento || 0),
          pctIva: Number(it.pctIva || 19),
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
    onSuccess: (data: any) => {
      success('Compra Registrada', `Factura ${numeroFactura} registrada. Se generó la entrada a inventario y la CxP.`);
      router.push('/proveedores');
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setSubmitError(err.problem);
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 pb-4 border-b border-[#e2e8f0]">
          <Link href="/proveedores">
            <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">Registrar Factura de Compra</h1>
            <p className="text-xs text-[#64748b]">
              Carga automática mediante XML UBL 2.1 o diligenciamiento asistido
            </p>
          </div>
        </div>

        {submitError && <BannerError error={submitError} status={submitError.status} />}

        {/* Zona Carga de XML UBL 2.1 */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-[#1d63ed]" />
            <h3 className="text-sm font-semibold text-[#0f172a]">Importar XML Factura Electrónica (UBL 2.1)</h3>
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

          <div className="border-2 border-dashed border-[#cbd5e1] rounded-xl p-6 text-center hover:bg-[#f8fafc] transition-colors">
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
              <Upload className="w-8 h-8 text-[#64748b]" />
              <span className="text-xs font-semibold text-[#0f172a]">
                {xmlFile ? xmlFile.name : 'Haz clic para seleccionar o arrastra el archivo XML UBL 2.1'}
              </span>
              <span className="text-[11px] text-[#64748b]">
                {isReadingXml ? 'Extrayendo datos de la factura...' : 'Formatos soportados: XML emitido por DIAN'}
              </span>
            </label>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
            Datos de la Factura de Compra
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Proveedor *
              </label>
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
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Bodega de Entrada *
              </label>
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

          {/* Retenciones */}
          <div className="pt-4 border-t border-[#e2e8f0] space-y-3">
            <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider block">
              Retenciones Aplicables
            </span>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="ReteFuente (%)"
                type="number"
                step="0.1"
                value={pctRetefuente}
                onChange={(e) => setPctRetefuente(e.target.value)}
              />
              <Input
                label="ReteIVA (%)"
                type="number"
                step="0.1"
                value={pctReteIva}
                onChange={(e) => setPctReteIva(e.target.value)}
              />
              <Input
                label="ReteICA (‰ por mil)"
                type="number"
                step="0.01"
                value={tarifaReteIcaPorMil}
                onChange={(e) => setTarifaReteIcaPorMil(e.target.value)}
                helperText="Tarifa en por mil (ej. 9.66)"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button
              variant="primary"
              className="h-10 px-6 font-semibold"
              isLoading={submitMutation.isPending}
              disabled={!idProveedor || !numeroFactura.trim()}
              onClick={() => submitMutation.mutate()}
            >
              Registrar Compra y Generar Entrada
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
