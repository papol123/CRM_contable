'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { formatCOP, formatDate } from '@/lib/format';
import { fechaLocalHoy } from '@/lib/cierre-diario';

export interface DocumentoPorCobrar {
  id: string;
  numero: string;
  deudor: string;
  fecha: string | null;
  total: number;
  saldo: number;
}

/** Registra un abono (POST /pagos) a una remisión con saldo pendiente. */
export function ModalAbono({
  documento,
  onClose,
  onRegistrado,
}: {
  documento: DocumentoPorCobrar | null;
  onClose: () => void;
  onRegistrado: (monto: number) => void;
}) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(fechaLocalHoy());
  const [idMetodo, setIdMetodo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ProblemDetails | null>(null);

  const { data: metodos = [] } = useQuery<any[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api<any[]>('/medios-pago'),
    staleTime: 5 * 60_000,
  });
  const efectivo = metodos.find((m) => m.codigo === 'EFECTIVO')?.id || metodos[0]?.id || '';

  // Al abrir con otro documento: monto = saldo pendiente, fecha de hoy y nueva clave idempotente
  useEffect(() => {
    if (!documento) return;
    setMonto(String(documento.saldo));
    setFecha(fechaLocalHoy());
    setIdMetodo('');
    setObservaciones('');
    setClave(crypto.randomUUID());
    setError(null);
  }, [documento]);

  const registrar = useMutation({
    mutationFn: () =>
      api('/pagos', {
        method: 'POST',
        headers: { 'Idempotency-Key': clave },
        body: JSON.stringify({
          tipoPago: 'factura de venta',
          idFactura: documento!.id,
          idMetodoPago: idMetodo || efectivo,
          monto: parseFloat(monto),
          fechaPago: fecha,
          observaciones: observaciones.trim() || undefined,
        }),
      }),
    onSuccess: () => onRegistrado(parseFloat(monto)),
    onError: (err: any) => {
      if (err instanceof ApiError) setError(err.problem);
    },
  });

  const valor = parseFloat(monto);
  const valido = !!documento && valor > 0 && valor <= (documento?.saldo ?? 0) + 0.001;

  return (
    <Modal
      isOpen={!!documento}
      onClose={onClose}
      title="Registrar abono"
      subtitle={documento ? `${documento.numero} · ${documento.deudor}` : undefined}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" isLoading={registrar.isPending} disabled={!valido} onClick={() => registrar.mutate()}>
            Registrar abono
          </Button>
        </div>
      }
    >
      {error && <BannerError error={error} status={error.status} />}
      {documento && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] text-xs">
            <p>
              Fecha {formatDate(documento.fecha)} · Total {formatCOP(documento.total)}
            </p>
            <p className="font-semibold text-[#0f172a]">Debe: {formatCOP(documento.saldo)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monto del abono *"
              type="number"
              min={0}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              helperText={valor === documento.saldo ? 'Paga la deuda completa' : `Quedaría debiendo ${formatCOP(Math.max(0, documento.saldo - (valor || 0)))}`}
            />
            <Input label="Fecha *" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">Medio de pago</label>
            <select
              value={idMetodo || efectivo}
              onChange={(e) => setIdMetodo(e.target.value)}
              className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md"
            >
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Observaciones"
            placeholder="Ej. Abono en efectivo / transferencia ref. 1234"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
