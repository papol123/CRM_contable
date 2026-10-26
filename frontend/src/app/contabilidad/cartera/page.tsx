'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Receipt,
  Plus,
  Ban,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingDown,
} from 'lucide-react';
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

export default function CarteraPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'PAGOS' | 'GASTOS'>('PAGOS');

  // Modal Registrar Pago
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [pagoTipo, setPagoTipo] = useState<'factura de venta' | 'factura de compra'>('factura de venta');
  const [pagoIdFactura, setPagoIdFactura] = useState('');
  const [pagoIdMetodo, setPagoIdMetodo] = useState('');
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoKey, setPagoKey] = useState(crypto.randomUUID());
  const [pagoError, setPagoError] = useState<ProblemDetails | null>(null);

  // Modal Anular Pago
  const [isAnularPagoOpen, setIsAnularPagoOpen] = useState(false);
  const [selectedPago, setSelectedPago] = useState<any | null>(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [anularError, setAnularError] = useState<ProblemDetails | null>(null);

  // Modal Registrar Gasto
  const [isGastoModalOpen, setIsGastoModalOpen] = useState(false);
  const [gastoIdCat, setGastoIdCat] = useState('');
  const [gastoDesc, setGastoDesc] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoFecha, setGastoFecha] = useState(new Date().toISOString().split('T')[0]);
  const [gastoError, setGastoError] = useState<ProblemDetails | null>(null);

  // 1. Métodos de pago
  const { data: metodosPago = [] } = useQuery<any[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api<any[]>('/medios-pago'),
  });

  // 2. Categorías de gasto
  const { data: categoriasGasto = [] } = useQuery<any[]>({
    queryKey: ['categorias-gasto'],
    queryFn: () => api<any[]>('/categorias-gasto'),
  });

  // 3. Listar Pagos (Usuario ve los suyos, Admin todos)
  const {
    data: pagosData,
    isLoading: loadingPagos,
    refetch: refetchPagos,
  } = useQuery({
    queryKey: ['pagos'],
    queryFn: () => api<any>('/pagos?limit=20'),
  });

  // 4. Listar Gastos
  const {
    data: gastosData,
    isLoading: loadingGastos,
    refetch: refetchGastos,
  } = useQuery({
    queryKey: ['gastos'],
    queryFn: () => api<any>('/gastos?limit=20'),
  });

  // Mutación: Registrar Pago
  const pagoMutation = useMutation({
    mutationFn: async () => {
      return api('/pagos', {
        method: 'POST',
        headers: {
          'Idempotency-Key': pagoKey,
        },
        body: JSON.stringify({
          tipoPago: pagoTipo,
          idFactura: pagoIdFactura.trim(),
          idMetodoPago: pagoIdMetodo || metodosPago[0]?.id,
          monto: parseFloat(pagoMonto),
        }),
      });
    },
    onSuccess: (data: any) => {
      success('Pago registrado', 'El abono ha sido imputado al saldo de la factura.');
      setIsPagoModalOpen(false);
      setPagoIdFactura('');
      setPagoMonto('');
      setPagoKey(crypto.randomUUID());
      setPagoError(null);
      refetchPagos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setPagoError(err.problem);
      }
    },
  });

  // Mutación: Anular Pago (Admin)
  const anularPagoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPago) return;
      return api(`/pagos/${selectedPago.id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: anularMotivo.trim() }),
      });
    },
    onSuccess: () => {
      success('Pago anulado', 'El saldo pendiente de la factura ha sido reabierto.');
      setIsAnularPagoOpen(false);
      setAnularMotivo('');
      setAnularError(null);
      refetchPagos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setAnularError(err.problem);
      }
    },
  });

  // Mutación: Registrar Gasto
  const gastoMutation = useMutation({
    mutationFn: async () => {
      return api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          idCategoriaGasto: gastoIdCat || categoriasGasto[0]?.id,
          descripcion: gastoDesc.trim(),
          monto: parseFloat(gastoMonto),
          fecha: gastoFecha,
        }),
      });
    },
    onSuccess: () => {
      success('Gasto registrado', 'El gasto operativo ha sido contabilizado exitosamente.');
      setIsGastoModalOpen(false);
      setGastoDesc('');
      setGastoMonto('');
      setGastoError(null);
      refetchGastos();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setGastoError(err.problem);
      }
    },
  });

  const pagosList = Array.isArray(pagosData) ? pagosData : pagosData?.data || [];
  const gastosList = Array.isArray(gastosData) ? gastosData : gastosData?.data || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Tesorería y Cartera</h1>
            <p className="text-xs text-[#64748b]">
              Registro de recibos de pago con idempotencia y control de gastos operativos
            </p>
          </div>

          <div className="flex items-center gap-3">
            {can('pagos.registrar') && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setPagoKey(crypto.randomUUID());
                  setPagoError(null);
                  setIsPagoModalOpen(true);
                }}
              >
                Registrar Pago
              </Button>
            )}
            {can('gastos.registrar') && (
              <Button
                variant="outline"
                icon={<TrendingDown className="w-4 h-4" />}
                onClick={() => {
                  setGastoError(null);
                  setIsGastoModalOpen(true);
                }}
              >
                Registrar Gasto
              </Button>
            )}
          </div>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex border-b border-[#e2e8f0] text-xs font-semibold gap-6">
          <button
            onClick={() => setActiveTab('PAGOS')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'PAGOS'
                ? 'border-[#1d63ed] text-[#1d63ed]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Recibos de Pago y Abonos
          </button>
          <button
            onClick={() => setActiveTab('GASTOS')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'GASTOS'
                ? 'border-[#1d63ed] text-[#1d63ed]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Gastos Operativos
          </button>
        </div>

        {/* Tab 1: Pagos */}
        {activeTab === 'PAGOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingPagos ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={5} />
              </div>
            ) : pagosList.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="w-8 h-8" />}
                title="No hay pagos registrados"
                description="Registra un recibo de caja o pago a proveedor para conciliar cartera."
                actionLabel="Registrar Pago"
                onAction={() => setIsPagoModalOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Factura ID / Consecutivo</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {pagosList.map((p: any) => (
                      <tr key={p.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 text-[#64748b]">{formatDate(p.fecha || p.createdAt)}</td>
                        <td className="py-3.5 px-4 capitalize font-medium text-[#0f172a]">{p.tipoPago}</td>
                        <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{p.idFactura?.substring(0, 8)}...</td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#0f172a] tabular-nums">
                          {formatCOP(p.monto)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {p.anulado ? (
                            <Badge variant="error">Anulado</Badge>
                          ) : (
                            <Badge variant="active">Procesado</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isAdmin && !p.anulado && can('pagos.anular') && (
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Gastos */}
        {activeTab === 'GASTOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingGastos ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={4} />
              </div>
            ) : gastosList.length === 0 ? (
              <EmptyState
                icon={<TrendingDown className="w-8 h-8" />}
                title="No hay gastos registrados"
                description="Registra gastos de energía, arrendamiento, nómina o servicios generales."
                actionLabel="Registrar Gasto"
                onAction={() => setIsGastoModalOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Descripción</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {gastosList.map((g: any) => (
                      <tr key={g.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 text-[#64748b]">{formatDate(g.fecha)}</td>
                        <td className="py-3.5 px-4 font-medium text-[#0f172a]">{g.descripcion}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#ef4444] tabular-nums">
                          {formatCOP(g.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal: Registrar Pago con Idempotency-Key */}
        <Modal
          isOpen={isPagoModalOpen}
          onClose={() => setIsPagoModalOpen(false)}
          title="Registrar Pago o Abono"
          subtitle={`Clave idempotente generada: ${pagoKey.substring(0, 8)}...`}
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsPagoModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={pagoMutation.isPending}
                disabled={!pagoIdFactura.trim() || !pagoMonto}
                onClick={() => pagoMutation.mutate()}
              >
                Procesar Pago
              </Button>
            </div>
          }
        >
          {pagoError && (
            <BannerError
              error={pagoError}
              status={pagoError.status}
              rceAction={
                pagoError.status === 422
                  ? {
                      label: 'Corregir Monto',
                      onClick: () => {
                        // RCE: Ajusta al saldo reportado si viene en detail
                        setPagoError(null);
                      },
                    }
                  : undefined
              }
            />
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Tipo de Imputación *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPagoTipo('factura de venta')}
                  className={`py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                    pagoTipo === 'factura de venta'
                      ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]'
                      : 'bg-white border-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  Cobro a Cliente (Venta)
                </button>
                <button
                  type="button"
                  onClick={() => setPagoTipo('factura de compra')}
                  className={`py-2 text-xs font-semibold rounded-md border text-center transition-colors ${
                    pagoTipo === 'factura de compra'
                      ? 'bg-[#eff4ff] border-[#1d63ed] text-[#1d63ed]'
                      : 'bg-white border-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  Pago a Proveedor (Compra)
                </button>
              </div>
            </div>

            <Input
              label="ID o Consecutivo de Factura *"
              placeholder="UUID de la factura de venta o compra"
              value={pagoIdFactura}
              onChange={(e) => setPagoIdFactura(e.target.value)}
              helperText="Identificador único del documento a imputar"
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Método de Pago *
              </label>
              <select
                value={pagoIdMetodo}
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
              label="Monto del Pago (COP) *"
              type="number"
              step="any"
              placeholder="100000"
              value={pagoMonto}
              onChange={(e) => setPagoMonto(e.target.value)}
              helperText="El monto no debe exceder el saldo pendiente"
            />
          </div>
        </Modal>

        {/* Modal: Anular Pago */}
        <Modal
          isOpen={isAnularPagoOpen}
          onClose={() => setIsAnularPagoOpen(false)}
          title="Anular Recibo de Pago"
          subtitle="Esta operación revierte el abono e incrementa el saldo pendiente"
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
                Confirmar Anulación
              </Button>
            </div>
          }
        >
          {anularError && <BannerError error={anularError} status={anularError.status} />}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Motivo Obligatorio *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Ej. Pago duplicado / Cheque devuelto por el banco"
                value={anularMotivo}
                onChange={(e) => setAnularMotivo(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
              />
            </div>
          </div>
        </Modal>

        {/* Modal: Registrar Gasto */}
        <Modal
          isOpen={isGastoModalOpen}
          onClose={() => setIsGastoModalOpen(false)}
          title="Registrar Gasto Operativo"
          subtitle="Comprobante interno de egreso"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsGastoModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={gastoMutation.isPending}
                disabled={!gastoDesc.trim() || !gastoMonto}
                onClick={() => gastoMutation.mutate()}
              >
                Guardar Gasto
              </Button>
            </div>
          }
        >
          {gastoError && (
            <BannerError
              error={gastoError}
              status={gastoError.status}
              rceAction={
                gastoError.status === 422
                  ? {
                      label: 'Usar Fecha de Hoy',
                      onClick: () => {
                        setGastoFecha(new Date().toISOString().split('T')[0]);
                        setGastoError(null);
                      },
                    }
                  : undefined
              }
            />
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Categoría de Gasto *
              </label>
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

            <Input
              label="Descripción del Gasto *"
              placeholder="Ej. Servicio de energía sede principal - Octubre 2026"
              value={gastoDesc}
              onChange={(e) => setGastoDesc(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Monto (COP) *"
                type="number"
                placeholder="150000"
                value={gastoMonto}
                onChange={(e) => setGastoMonto(e.target.value)}
              />
              <Input
                label="Fecha de Operación *"
                type="date"
                value={gastoFecha}
                onChange={(e) => setGastoFecha(e.target.value)}
                helperText="Debe pertenecer a un periodo abierto"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
