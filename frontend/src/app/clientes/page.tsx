'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  Plus,
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  Building,
  User,
  ArrowRight,
  Lock,
  Unlock,
  AlertCircle,
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
import { formatCOP, cleanIdentification } from '@/lib/format';

interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
}

interface Cliente {
  id: string;
  tercero?: {
    id?: string;
    numeroDocumento: string;
    razonSocial: string;
    tipoPersona?: string;
    activo: boolean;
  };
  numeroDocumento?: string;
  razonSocial?: string;
  creditoBloqueado?: boolean;
  activo?: boolean;
}

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  // Estados del modal de creación
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTipoDoc, setNewTipoDoc] = useState('');
  const [newNumDoc, setNewNumDoc] = useState('');
  const [newRazonSocial, setNewRazonSocial] = useState('');
  const [newTipoPersona, setNewTipoPersona] = useState<'NATURAL' | 'JURIDICA'>('JURIDICA');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [createError, setCreateError] = useState<ProblemDetails | null>(null);

  // Estados de gestión de crédito (A1 / A2)
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditActionType, setCreditActionType] = useState<'block' | 'unblock' | 'quota'>('quota');
  const [creditMotivo, setCreditMotivo] = useState('');
  const [newCupoCredito, setNewCupoCredito] = useState('');
  const [newDiasPlazo, setNewDiasPlazo] = useState('30');
  const [creditError, setCreditError] = useState<ProblemDetails | null>(null);

  // 1. Catálogo de tipos de documento
  const { data: tiposDocumento = [] } = useQuery<TipoDocumento[]>({
    queryKey: ['tipos-documento'],
    queryFn: () => api<TipoDocumento[]>('/tipos-documento'),
  });

  // 2. Consulta de clientes (Admin: GET /clientes?limit=50, Usuario: GET /clientes/buscar?q=)
  const {
    data: clientesData,
    isLoading: loadingClientes,
    error: errorClientes,
    refetch: refetchClientes,
  } = useQuery({
    queryKey: ['clientes', searchTerm, isAdmin],
    queryFn: async () => {
      if (isAdmin && !searchTerm) {
        const res = await api<{ data: Cliente[]; meta: { total: number } }>('/clientes?limit=50');
        return res.data;
      } else {
        // Búsqueda para usuario o con filtro q
        const res = await api<Cliente[]>(`/clientes/buscar?q=${encodeURIComponent(searchTerm)}`);
        return res;
      }
    },
  });

  // 3. Consulta de cartera del cliente seleccionado
  const { data: carteraData, refetch: refetchCartera } = useQuery({
    queryKey: ['cliente-cartera', selectedCliente?.id],
    queryFn: () => api<any>(`/clientes/${selectedCliente?.id}/cartera`),
    enabled: !!selectedCliente?.id,
  });

  // Detección proactiva de duplicados en blur (Pilar RCE §3.2)
  const handleBlurDoc = async () => {
    if (!newNumDoc.trim()) return;
    try {
      const match = await api<Cliente[]>(`/clientes/buscar?q=${encodeURIComponent(newNumDoc.trim())}`);
      if (match && match.length > 0) {
        setDuplicateWarning(`El documento ${newNumDoc} ya existe en el sistema para "${match[0].razonSocial}".`);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Ignorar fallo de búsqueda en blur
    }
  };

  // Crear cliente
  const createMutation = useMutation({
    mutationFn: async () => {
      return api('/clientes', {
        method: 'POST',
        body: JSON.stringify({
          idTipoDocumento: newTipoDoc || (tiposDocumento[0]?.id ?? ''),
          numeroDocumento: cleanIdentification(newNumDoc),
          razonSocial: newRazonSocial.trim(),
          tipoPersona: newTipoPersona,
        }),
      });
    },
    onSuccess: (data: any) => {
      success('Cliente creado', 'El cliente ha sido registrado exitosamente en el directorio.');
      setIsCreateOpen(false);
      setNewNumDoc('');
      setNewRazonSocial('');
      setCreateError(null);
      setDuplicateWarning(null);
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setCreateError(err.problem);
      }
    },
  });

  // Modificar crédito (Bloquear / Desbloquear / Cupo)
  const creditMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCliente) return;

      if (creditActionType === 'block') {
        return api(`/clientes/${selectedCliente.id}/bloquear-credito`, {
          method: 'POST',
          body: JSON.stringify({ motivo: creditMotivo.trim() }),
        });
      } else if (creditActionType === 'unblock') {
        return api(`/clientes/${selectedCliente.id}/desbloquear-credito`, {
          method: 'POST',
          body: JSON.stringify({ motivo: creditMotivo.trim() }),
        });
      } else {
        return api(`/clientes/${selectedCliente.id}/cupo-credito`, {
          method: 'PATCH',
          body: JSON.stringify({
            cupoCredito: parseFloat(newCupoCredito) || 0,
            diasPlazo: parseInt(newDiasPlazo, 10) || 30,
          }),
        });
      }
    },
    onSuccess: () => {
      success('Crédito actualizado', 'Las condiciones de crédito del cliente fueron modificadas.');
      setIsCreditModalOpen(false);
      setCreditMotivo('');
      setCreditError(null);
      refetchCartera();
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setCreditError(err.problem);
      }
    },
  });

  const clientesList: Cliente[] = Array.isArray(clientesData) ? clientesData : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Directorio de Clientes</h1>
            <p className="text-xs text-[#64748b]">
              Gestión de cartera, cupos de crédito y terceros comerciales
            </p>
          </div>

          <div className="flex items-center gap-3">
            {can('terceros.crear') && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setCreateError(null);
                  setDuplicateWarning(null);
                  setIsCreateOpen(true);
                }}
              >
                Nuevo Cliente
              </Button>
            )}
          </div>
        </div>

        {/* Buscador y Filtros */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-card flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por razón social, nombre o número de documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[38px] pl-9 pr-3 text-xs bg-[#f8fafc] border border-[#e2e8f0] rounded-md focus:bg-white focus:outline-none focus:border-[#1d63ed]"
            />
          </div>
        </div>

        {/* Error en consulta */}
        {errorClientes && (
          <BannerError
            error={errorClientes}
            rceAction={{ label: 'Reintentar búsqueda', onClick: () => refetchClientes() }}
          />
        )}

        {/* Contenido Principal: Tabla y Detalle */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado de Clientes */}
          <div className={`bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden ${selectedCliente ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {loadingClientes ? (
              <div className="p-4">
                <TableSkeleton rows={6} cols={4} />
              </div>
            ) : clientesList.length === 0 ? (
              <EmptyState
                icon={<Users className="w-8 h-8" />}
                title={searchTerm ? 'No encontramos coincidencias' : 'Aún no tienes clientes registrados'}
                description={
                  searchTerm
                    ? `No se encontraron resultados para "${searchTerm}". Puedes registrar un nuevo cliente con este documento.`
                    : 'Registra a tu primer cliente para comenzar a emitir cotizaciones y remisiones.'
                }
                actionLabel={can('terceros.crear') ? 'Nuevo Cliente' : undefined}
                onAction={() => {
                  setNewNumDoc(searchTerm);
                  setIsCreateOpen(true);
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Documento</th>
                      <th className="py-3 px-4">Razón Social</th>
                      <th className="py-3 px-4 text-center">Tipo</th>
                      <th className="py-3 px-4 text-center">Crédito</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {clientesList.map((cli) => {
                      const doc = cli.tercero?.numeroDocumento || cli.numeroDocumento || '—';
                      const nombre = cli.tercero?.razonSocial || cli.razonSocial || 'Sin nombre';
                      const isBloqueado = cli.creditoBloqueado;
                      const isSelected = selectedCliente?.id === cli.id;

                      return (
                        <tr
                          key={cli.id}
                          onClick={() => setSelectedCliente(cli)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eff4ff]' : 'hover:bg-[#f8fafc]'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{doc}</td>
                          <td className="py-3.5 px-4 font-medium text-[#0f172a]">{nombre}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="text-[11px] px-2 py-0.5 rounded bg-[#f1f5f9] text-[#64748b] font-medium">
                              {cli.tercero?.tipoPersona || 'JURIDICA'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isBloqueado ? (
                              <Badge variant="error">Bloqueado</Badge>
                            ) : (
                              <Badge variant="active">Habilitado</Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCliente(cli);
                              }}
                            >
                              Ver ficha
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Panel Lateral: Ficha y Crédito del Cliente (A1 / A2) */}
          {selectedCliente && (
            <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5 flex flex-col justify-between space-y-4 animate-in slide-in-from-right-4 duration-150">
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-3 border-b border-[#e2e8f0]">
                  <div>
                    <h3 className="text-base font-semibold text-[#0f172a]">
                      {selectedCliente.tercero?.razonSocial || selectedCliente.razonSocial}
                    </h3>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      NIT / CC: {selectedCliente.tercero?.numeroDocumento || selectedCliente.numeroDocumento}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCliente(null)}
                    className="text-xs text-[#64748b] hover:text-[#0f172a]"
                  >
                    Cerrar
                  </button>
                </div>

                {/* Resumen de Cartera y Cupo */}
                <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748b]">Estado de crédito:</span>
                    {carteraData?.creditoBloqueado ? (
                      <Badge variant="error">Bloqueado</Badge>
                    ) : (
                      <Badge variant="active">Al día</Badge>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748b]">Cupo asignado:</span>
                    <span className="font-semibold text-[#0f172a] tabular-nums">
                      {formatCOP(carteraData?.cupoCredito ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748b]">Saldo pendiente (CxC):</span>
                    <span className="font-semibold text-[#0f172a] tabular-nums">
                      {formatCOP(carteraData?.saldoTotal ?? carteraData?.saldo ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Controles para Administrador */}
                {isAdmin && can('cartera.gestionar') && (
                  <div className="pt-2 space-y-2">
                    <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider block">
                      Gestión Financiera (Admin)
                    </span>

                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<CreditCard className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setCreditActionType('quota');
                          setNewCupoCredito(String(carteraData?.cupoCredito ?? ''));
                          setIsCreditModalOpen(true);
                        }}
                      >
                        Ajustar Cupo y Plazo
                      </Button>

                      {carteraData?.creditoBloqueado ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Unlock className="w-3.5 h-3.5 text-[#10b981]" />}
                          onClick={() => {
                            setCreditActionType('unblock');
                            setCreditMotivo('');
                            setIsCreditModalOpen(true);
                          }}
                        >
                          Desbloquear Crédito
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          icon={<Lock className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setCreditActionType('block');
                            setCreditMotivo('');
                            setIsCreditModalOpen(true);
                          }}
                        >
                          Bloquear Crédito
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal: Nuevo Cliente */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Registrar Nuevo Cliente"
          subtitle="Ingresa la información básica comercial"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                disabled={!newNumDoc || !newRazonSocial}
              >
                Guardar Cliente
              </Button>
            </div>
          }
        >
          {createError && <BannerError error={createError} status={createError.status} />}

          {duplicateWarning && (
            <div className="p-3 bg-[#fffbeb] border border-[#fde68a] rounded-lg text-xs text-[#92400e] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#f59e0b] shrink-0" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  Tipo Documento *
                </label>
                <select
                  value={newTipoDoc}
                  onChange={(e) => setNewTipoDoc(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  {tiposDocumento.map((td) => (
                    <option key={td.id} value={td.id}>
                      {td.codigo} — {td.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  Tipo Persona *
                </label>
                <select
                  value={newTipoPersona}
                  onChange={(e) => setNewTipoPersona(e.target.value as any)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  <option value="JURIDICA">Persona Jurídica (Empresa)</option>
                  <option value="NATURAL">Persona Natural</option>
                </select>
              </div>
            </div>

            <Input
              label="Número de Documento (NIT o Cédula)"
              type="text"
              required
              placeholder="Ej. 900345678"
              value={newNumDoc}
              onChange={(e) => setNewNumDoc(cleanIdentification(e.target.value))}
              onBlur={handleBlurDoc}
              helperText="Detecta duplicados proactivamente al salir del campo"
            />

            <Input
              label="Razón Social o Nombre Completo"
              type="text"
              required
              placeholder="Ej. Taller Eje Central S.A.S."
              value={newRazonSocial}
              onChange={(e) => setNewRazonSocial(e.target.value)}
            />
          </div>
        </Modal>

        {/* Modal: Ajustar Crédito / Bloquear / Desbloquear */}
        <Modal
          isOpen={isCreditModalOpen}
          onClose={() => setIsCreditModalOpen(false)}
          title={
            creditActionType === 'block'
              ? 'Bloquear Crédito de Cliente'
              : creditActionType === 'unblock'
              ? 'Desbloquear Crédito de Cliente'
              : 'Definir Cupo de Crédito y Días de Plazo'
          }
          subtitle={`Cliente: ${selectedCliente?.tercero?.razonSocial || selectedCliente?.razonSocial}`}
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsCreditModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant={creditActionType === 'block' ? 'destructive' : 'primary'}
                isLoading={creditMutation.isPending}
                disabled={
                  (creditActionType !== 'quota' && !creditMotivo.trim()) ||
                  (creditActionType === 'quota' && !newCupoCredito)
                }
                onClick={() => creditMutation.mutate()}
              >
                Confirmar
              </Button>
            </div>
          }
        >
          {creditError && <BannerError error={creditError} status={creditError.status} />}

          {creditActionType === 'quota' ? (
            <div className="space-y-4">
              <Input
                label="Cupo Máximo de Crédito (COP)"
                type="number"
                required
                placeholder="5000000"
                value={newCupoCredito}
                onChange={(e) => setNewCupoCredito(e.target.value)}
                helperText="Monto límite en pesos para ventas a crédito"
              />
              <Input
                label="Días de Plazo"
                type="number"
                required
                placeholder="30"
                value={newDiasPlazo}
                onChange={(e) => setNewDiasPlazo(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#64748b]">
                {creditActionType === 'block'
                  ? 'Al bloquear el crédito, el cliente solo podrá realizar compras de contado. Se conservará su cupo configurado.'
                  : 'Al desbloquear el crédito, se habilitará nuevamente la emisión de remisiones a plazo según el cupo vigente.'}
              </p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  Motivo obligatorio *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej. Mora mayor a 90 días / Acuerdo de pago alcanzado..."
                  value={creditMotivo}
                  onChange={(e) => setCreditMotivo(e.target.value)}
                  className="w-full p-2.5 text-xs bg-white border border-[#e2e8f0] rounded-md focus:outline-none focus:border-[#1d63ed]"
                />
              </div>
            </div>
          )}
        </Modal>
      </div>
    </AppLayout>
  );
}
