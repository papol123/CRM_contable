'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BannerError } from '@/components/ui/BannerError';
import { api, ApiError, ProblemDetails } from '@/lib/api';
import { formatCOP } from '@/lib/format';
import { fechaLocalHoy, sumarDiasISO } from '@/lib/cierre-diario';

const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';

/**
 * Remisión rápida (POST /facturas-venta/rapida): solo número de la factura
 * física y valor. De contado queda cobrada; a crédito queda en Deudores.
 */
export function ModalRemisionRapida({
  isOpen,
  onClose,
  onCreada,
  fecha: fechaInicial,
  creditoInicial = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreada: (remision: any) => void;
  fecha?: string;
  creditoInicial?: boolean;
}) {
  const [numero, setNumero] = useState('');
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(fechaInicial || fechaLocalHoy());
  const [credito, setCredito] = useState(creditoInicial);
  const [cliente, setCliente] = useState<any | null>(null);
  const [buscarCliente, setBuscarCliente] = useState('');
  const [nombreDeudor, setNombreDeudor] = useState('');
  const [diasPlazo, setDiasPlazo] = useState('30');
  const [idMetodo, setIdMetodo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ProblemDetails | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNumero('');
    setValor('');
    setFecha(fechaInicial || fechaLocalHoy());
    setCredito(creditoInicial);
    setCliente(null);
    setBuscarCliente('');
    setNombreDeudor('');
    setDiasPlazo('30');
    setObservaciones('');
    setClave(crypto.randomUUID());
    setError(null);
  }, [isOpen, fechaInicial, creditoInicial]);

  const { data: metodos = [] } = useQuery<any[]>({
    queryKey: ['medios-pago'],
    queryFn: () => api<any[]>('/medios-pago'),
    staleTime: 5 * 60_000,
  });
  const efectivo = metodos.find((m) => m.codigo === 'EFECTIVO')?.id || metodos[0]?.id || '';

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['buscar-clientes-rapida', buscarCliente],
    queryFn: () => api<any[]>(`/clientes/buscar?q=${encodeURIComponent(buscarCliente.trim())}`),
    enabled: credito && buscarCliente.trim().length >= 2,
  });

  // Sin cliente elegido la venta es a Consumidor final
  const esConsumidorFinal = !cliente || cliente.numeroDocumento === DOCUMENTO_CONSUMIDOR_FINAL;
  const montoValido = parseFloat(valor) > 0;
  const faltaDeudor = credito && esConsumidorFinal && !nombreDeudor.trim();
  const puedeGuardar = !!numero.trim() && montoValido && !faltaDeudor;

  const crear = useMutation({
    mutationFn: () =>
      api<any>('/facturas-venta/rapida', {
        method: 'POST',
        headers: { 'Idempotency-Key': clave },
        body: JSON.stringify({
          numeroFactura: numero.trim(),
          valor: parseFloat(valor),
          fecha,
          credito,
          diasPlazo: credito ? parseInt(diasPlazo, 10) || 30 : undefined,
          idCliente: cliente && !esConsumidorFinal ? cliente.id : undefined,
          nombreDeudor: credito && esConsumidorFinal ? nombreDeudor.trim() : undefined,
          idMetodoPago: credito ? undefined : idMetodo || efectivo || undefined,
          observaciones: observaciones.trim() || undefined,
        }),
      }),
    onSuccess: (res) => onCreada(res),
    onError: (err: any) => {
      if (err instanceof ApiError) setError(err.problem);
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Remisión rápida"
      subtitle="Solo el número de la factura y el valor"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>
            {credito ? 'Registrar a crédito' : 'Registrar de contado'}
          </Button>
        </div>
      }
    >
      {error && <BannerError error={error} status={error.status} />}
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Input label="N° de factura *" placeholder="Ej. 004512" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <Input label="Valor total (COP) *" type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCredito(false)}
            className={`py-2 font-semibold rounded-md border ${
              !credito ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-[#e2e8f0] text-[#64748b]'
            }`}
          >
            De contado (pagó)
          </button>
          <button
            type="button"
            onClick={() => setCredito(true)}
            className={`py-2 font-semibold rounded-md border ${
              credito ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-white border-[#e2e8f0] text-[#64748b]'
            }`}
          >
            A crédito (queda debiendo)
          </button>
        </div>

        {credito ? (
          <div className="space-y-3 p-3 rounded-lg border border-amber-200 bg-amber-50/40">
            <div className="space-y-1">
              <label className="font-semibold text-[#0f172a] uppercase tracking-wider">Cliente</label>
              {cliente ? (
                <div className="flex items-center justify-between p-2 bg-white border border-[#e2e8f0] rounded-md">
                  <span>
                    <span className="font-semibold">{cliente.razonSocial}</span>{' '}
                    <span className="text-[#64748b]">{cliente.numeroDocumento}</span>
                  </span>
                  <button type="button" className="text-[#1d63ed] hover:underline" onClick={() => setCliente(null)}>
                    Quitar
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Consumidor final (o busca un cliente registrado)"
                    value={buscarCliente}
                    onChange={(e) => setBuscarCliente(e.target.value)}
                  />
                  {clientes.length > 0 && (
                    <div className="border border-[#e2e8f0] rounded-md bg-white max-h-36 overflow-y-auto divide-y divide-[#f1f5f9]">
                      {clientes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCliente(c);
                            setBuscarCliente('');
                          }}
                          className="w-full text-left p-2 hover:bg-[#eff4ff]"
                        >
                          <span className="font-semibold">{c.razonSocial}</span>{' '}
                          <span className="text-[#64748b]">{c.numeroDocumento}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {esConsumidorFinal && (
              <Input
                label="¿Quién queda debiendo? *"
                placeholder="Nombre y teléfono. Ej. Pedro Gómez 310 555 1234"
                value={nombreDeudor}
                onChange={(e) => setNombreDeudor(e.target.value)}
                error={faltaDeudor && numero && montoValido ? 'Escribe el nombre para poder cobrarle después' : undefined}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Plazo (días)" type="number" min={1} value={diasPlazo} onChange={(e) => setDiasPlazo(e.target.value)} />
              <div className="space-y-1">
                <span className="font-semibold text-[#0f172a] uppercase tracking-wider block">Vence</span>
                <span className="block h-[38px] leading-[38px] text-sm">
                  {sumarDiasISO(fecha, parseInt(diasPlazo, 10) || 30)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="font-semibold text-[#0f172a] uppercase tracking-wider">Medio de pago</label>
            <select
              value={idMetodo || efectivo}
              onChange={(e) => setIdMetodo(e.target.value)}
              className="w-full h-[38px] px-3 bg-white border border-[#e2e8f0] rounded-md"
            >
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Input label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        {montoValido && (
          <p className="text-[#64748b]">
            {credito
              ? `Quedará en Deudores por ${formatCOP(parseFloat(valor))}.`
              : `Entra a caja ${formatCOP(parseFloat(valor))}.`}
          </p>
        )}
      </div>
    </Modal>
  );
}
