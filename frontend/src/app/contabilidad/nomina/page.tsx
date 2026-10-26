'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Calculator,
  Plus,
  DollarSign,
  Download,
  AlertCircle,
  CheckCircle2,
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
import { formatCOP, formatPeriodo } from '@/lib/format';

export default function NominaPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();

  const [activeTab, setActiveTab] = useState<'PERIODOS' | 'EMPLEADOS'>('PERIODOS');

  // Modal Abrir Nómina
  const [isAbrirOpen, setIsAbrirOpen] = useState(false);
  const [nomMes, setNomMes] = useState(new Date().getMonth() + 1);
  const [nomAnio, setNomAnio] = useState(new Date().getFullYear());
  const [abrirError, setAbrirError] = useState<ProblemDetails | null>(null);

  // Modal Nuevo Empleado
  const [isEmpleadoOpen, setIsEmpleadoOpen] = useState(false);
  const [empTipoDoc, setEmpTipoDoc] = useState('');
  const [empNumDoc, setEmpNumDoc] = useState('');
  const [empNombre, setEmpNombre] = useState('');
  const [empCargo, setEmpCargo] = useState('');
  const [empSalario, setEmpSalario] = useState('1423500');
  const [empFechaIngreso, setEmpFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
  const [empError, setEmpError] = useState<ProblemDetails | null>(null);

  // 1. Tipos de documento
  const { data: tiposDoc = [] } = useQuery<any[]>({
    queryKey: ['tipos-documento'],
    queryFn: () => api<any[]>('/tipos-documento'),
  });

  // 2. Histórico de Nóminas
  const {
    data: nominas = [],
    isLoading: loadingNominas,
    refetch: refetchNominas,
  } = useQuery<any[]>({
    queryKey: ['nomina'],
    queryFn: () => api<any[]>('/nomina'),
  });

  // 3. Empleados
  const {
    data: empleados = [],
    isLoading: loadingEmpleados,
    refetch: refetchEmpleados,
  } = useQuery<any[]>({
    queryKey: ['empleados'],
    queryFn: () => api<any[]>('/empleados'),
  });

  // Mutación: Abrir Periodo
  const abrirMutation = useMutation({
    mutationFn: async () => {
      return api('/nomina', {
        method: 'POST',
        body: JSON.stringify({ mes: Number(nomMes), anio: Number(nomAnio) }),
      });
    },
    onSuccess: () => {
      success('Periodo de Nómina Abierto', `Se liquidó preliminarmente el mes ${nomMes}/${nomAnio}.`);
      setIsAbrirOpen(false);
      setAbrirError(null);
      refetchNominas();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setAbrirError(err.problem);
    },
  });

  // Mutación: Pagar Nómina
  const pagarMutation = useMutation({
    mutationFn: async (idNomina: string) => {
      return api<{ idGasto: string }>(`/nomina/${idNomina}/pagar`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data) => {
      success('Nómina Pagada', `Se generó el comprobante de gasto correspondiente (${data.idGasto?.substring(0, 8)}).`);
      refetchNominas();
    },
  });

  // Mutación: Crear Empleado
  const empMutation = useMutation({
    mutationFn: async () => {
      return api('/empleados', {
        method: 'POST',
        body: JSON.stringify({
          idTipoDocumento: empTipoDoc || tiposDoc[0]?.id,
          numeroDocumento: empNumDoc.trim(),
          nombreCompleto: empNombre.trim(),
          cargo: empCargo.trim(),
          salarioBase: parseFloat(empSalario),
          fechaIngreso: empFechaIngreso,
        }),
      });
    },
    onSuccess: () => {
      success('Empleado Registrado', 'El empleado ha sido incorporado al padrón de nómina.');
      setIsEmpleadoOpen(false);
      setEmpNumDoc('');
      setEmpNombre('');
      setEmpCargo('');
      setEmpError(null);
      refetchEmpleados();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setEmpError(err.problem);
    },
  });

  const handleDownloadDesprendibles = async (idNomina: string) => {
    try {
      const res = await api<Response>(`/nomina/${idNomina}/desprendibles`, { raw: true });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `desprendibles-nomina-${idNomina.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Error descargando los desprendibles de pago.');
    }
  };

  const nominasList = Array.isArray(nominas) ? nominas : [];
  const empleadosList = Array.isArray(empleados) ? empleados : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Liquidación de Nómina</h1>
            <p className="text-xs text-[#64748b]">
              Cálculo de devengados, auxilio de transporte y dispersión salarial
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              icon={<Users className="w-4 h-4" />}
              onClick={() => {
                setEmpError(null);
                setIsEmpleadoOpen(true);
              }}
            >
              Nuevo Empleado
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setAbrirError(null);
                setIsAbrirOpen(true);
              }}
            >
              Liquidar Periodo
            </Button>
          </div>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex border-b border-[#e2e8f0] text-xs font-semibold gap-6">
          <button
            onClick={() => setActiveTab('PERIODOS')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'PERIODOS'
                ? 'border-[#1d63ed] text-[#1d63ed]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Periodos Liquidados
          </button>
          <button
            onClick={() => setActiveTab('EMPLEADOS')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'EMPLEADOS'
                ? 'border-[#1d63ed] text-[#1d63ed]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Padrón de Empleados ({empleadosList.length})
          </button>
        </div>

        {/* Tab 1: Periodos Liquidados */}
        {activeTab === 'PERIODOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingNominas ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={5} />
              </div>
            ) : nominasList.length === 0 ? (
              <EmptyState
                icon={<Calculator className="w-8 h-8" />}
                title="Aún no hay nóminas liquidadas"
                description="Abre el primer periodo mensual para generar el cálculo salarial de los empleados."
                actionLabel="Liquidar Periodo"
                onAction={() => setIsAbrirOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Periodo</th>
                      <th className="py-3 px-4">Año</th>
                      <th className="py-3 px-4">Mes</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {nominasList.map((nom: any) => {
                      const isPagada = nom.estado === 'PAGADA' || !!nom.idGasto;

                      return (
                        <tr key={nom.id} className="hover:bg-[#f8fafc]">
                          <td className="py-3.5 px-4 font-semibold text-[#0f172a]">
                            {formatPeriodo(`${nom.anio}-${String(nom.mes).padStart(2, '0')}`)}
                          </td>
                          <td className="py-3.5 px-4 text-[#64748b]">{nom.anio}</td>
                          <td className="py-3.5 px-4 text-[#64748b]">{nom.mes}</td>
                          <td className="py-3.5 px-4 text-center">
                            {isPagada ? (
                              <Badge variant="active">Pagada</Badge>
                            ) : (
                              <Badge variant="pending">Liquidada / Pendiente Pago</Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Download className="w-3.5 h-3.5" />}
                              onClick={() => handleDownloadDesprendibles(nom.id)}
                            >
                              PDF
                            </Button>

                            {!isPagada && (
                              <Button
                                size="sm"
                                variant="primary"
                                isLoading={pagarMutation.isPending}
                                onClick={() => pagarMutation.mutate(nom.id)}
                              >
                                Pagar y Generar Gasto
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Empleados */}
        {activeTab === 'EMPLEADOS' && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
            {loadingEmpleados ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={4} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Documento</th>
                      <th className="py-3 px-4">Nombre Completo</th>
                      <th className="py-3 px-4">Cargo</th>
                      <th className="py-3 px-4 text-right">Salario Base</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {empleadosList.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{emp.numeroDocumento}</td>
                        <td className="py-3.5 px-4 font-medium text-[#0f172a]">{emp.nombreCompleto}</td>
                        <td className="py-3.5 px-4 text-[#64748b]">{emp.cargo}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#0f172a] tabular-nums">
                          {formatCOP(emp.salarioBase)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal: Liquidar Periodo */}
        <Modal
          isOpen={isAbrirOpen}
          onClose={() => setIsAbrirOpen(false)}
          title="Liquidar Periodo Salarial"
          subtitle="Genera la pre-liquidación con salarios y auxilio legal"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsAbrirOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={abrirMutation.isPending}
                onClick={() => abrirMutation.mutate()}
              >
                Abrir y Liquidar
              </Button>
            </div>
          }
        >
          {abrirError && <BannerError error={abrirError} status={abrirError.status} />}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mes (1 - 12) *"
              type="number"
              min={1}
              max={12}
              value={nomMes}
              onChange={(e) => setNomMes(parseInt(e.target.value, 10) || 1)}
            />
            <Input
              label="Año *"
              type="number"
              min={2020}
              value={nomAnio}
              onChange={(e) => setNomAnio(parseInt(e.target.value, 10) || 2026)}
            />
          </div>
        </Modal>

        {/* Modal: Nuevo Empleado */}
        <Modal
          isOpen={isEmpleadoOpen}
          onClose={() => setIsEmpleadoOpen(false)}
          title="Incorporar Empleado"
          subtitle="Ficha laboral y asignación salarial"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsEmpleadoOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={empMutation.isPending}
                disabled={!empNumDoc || !empNombre || !empCargo}
                onClick={() => empMutation.mutate()}
              >
                Registrar Empleado
              </Button>
            </div>
          }
        >
          {empError && <BannerError error={empError} status={empError.status} />}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                  Tipo Doc. *
                </label>
                <select
                  value={empTipoDoc}
                  onChange={(e) => setEmpTipoDoc(e.target.value)}
                  className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
                >
                  {tiposDoc.map((td) => (
                    <option key={td.id} value={td.id}>
                      {td.codigo}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Número Documento *"
                value={empNumDoc}
                onChange={(e) => setEmpNumDoc(e.target.value)}
                placeholder="1000000201"
              />
            </div>

            <Input
              label="Nombre Completo *"
              value={empNombre}
              onChange={(e) => setEmpNombre(e.target.value)}
              placeholder="Ana Torres"
            />

            <Input
              label="Cargo *"
              value={empCargo}
              onChange={(e) => setEmpCargo(e.target.value)}
              placeholder="Auxiliar de Bodega"
            />

            <Input
              label="Salario Base Mensual (COP) *"
              type="number"
              value={empSalario}
              onChange={(e) => setEmpSalario(e.target.value)}
            />
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
