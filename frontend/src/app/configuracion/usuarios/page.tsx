'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Power,
  Mail,
  User,
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
import { getCurrentUser } from '@/lib/auth';

export default function UsuariosConfigPage() {
  const queryClient = useQueryClient();
  const { success } = useToast();
  const currentUser = getCurrentUser();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNombres, setNewNombres] = useState('');
  const [newApellidos, setNewApellidos] = useState('');
  const [newIdRol, setNewIdRol] = useState('');
  const [inviteError, setInviteError] = useState<ProblemDetails | null>(null);

  // 1. Roles
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ['roles'],
    queryFn: () => api<any[]>('/roles'),
  });

  // 2. Usuarios
  const {
    data: usuariosData,
    isLoading: loadingUsuarios,
    refetch: refetchUsuarios,
  } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<any>('/usuarios?limit=100'),
  });

  // Mutación: Invitar usuario
  const inviteMutation = useMutation({
    mutationFn: async () => {
      return api('/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail.trim(),
          nombres: newNombres.trim(),
          apellidos: newApellidos.trim(),
          idRol: newIdRol || roles[0]?.id,
        }),
      });
    },
    onSuccess: () => {
      success('Invitación enviada', 'El nuevo usuario recibirá el correo para activar su contraseña.');
      setIsInviteOpen(false);
      setNewEmail('');
      setNewNombres('');
      setNewApellidos('');
      setInviteError(null);
      refetchUsuarios();
    },
    onError: (err: any) => {
      if (err instanceof ApiError) setInviteError(err.problem);
    },
  });

  // Mutación: Alternar estado activo/inactivo
  const toggleMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const endpoint = activo ? `/usuarios/${id}/desactivar` : `/usuarios/${id}/activar`;
      return api(endpoint, { method: 'POST' });
    },
    onSuccess: () => {
      success('Estado modificado', 'El estado del usuario ha sido actualizado.');
      refetchUsuarios();
    },
  });

  const usuariosList = Array.isArray(usuariosData) ? usuariosData : usuariosData?.data || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Usuarios y Control de Acceso</h1>
            <p className="text-xs text-[#64748b]">
              Padrón de cuentas corporativas, invitaciones y roles RBAC
            </p>
          </div>

          <Button
            variant="primary"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={() => {
              setInviteError(null);
              setIsInviteOpen(true);
            }}
          >
            Invitar Usuario
          </Button>
        </div>

        {/* Tabla de usuarios */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden">
          {loadingUsuarios ? (
            <div className="p-4">
              <TableSkeleton rows={5} cols={5} />
            </div>
          ) : usuariosList.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8" />}
              title="No hay usuarios registrados"
              description="Invita al equipo operativo y contable a la plataforma."
              actionLabel="Invitar Usuario"
              onAction={() => setIsInviteOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Nombre Completo</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {usuariosList.map((u: any) => {
                    const isSelf = u.id === currentUser?.sub || u.email === currentUser?.email;
                    const isActive = u.activo !== false;

                    return (
                      <tr key={u.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 font-semibold text-[#0f172a]">{u.email}</td>
                        <td className="py-3.5 px-4 font-medium text-[#0f172a]">
                          {u.nombres || ''} {u.apellidos || ''}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-semibold text-[#1d63ed]">
                            <Shield className="w-3.5 h-3.5" />
                            {u.rol?.codigo || u.rol || 'USUARIO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isActive ? (
                            <Badge variant="active">Activo</Badge>
                          ) : (
                            <Badge variant="error">Inactivo</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="sm"
                            variant={isActive ? 'ghost' : 'outline'}
                            disabled={isSelf || toggleMutation.isPending}
                            title={isSelf ? 'No puedes desactivar tu propio usuario en sesión' : undefined}
                            onClick={() => toggleMutation.mutate({ id: u.id, activo: isActive })}
                          >
                            <Power className="w-3.5 h-3.5 mr-1" />
                            {isActive ? 'Desactivar' : 'Activar'}
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

        {/* Modal: Invitar Usuario */}
        <Modal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          title="Invitar Nuevo Usuario"
          subtitle="Se enviará un correo con el enlace seguro para fijar contraseña"
          footer={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setIsInviteOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={inviteMutation.isPending}
                disabled={!newEmail.trim() || !newNombres.trim()}
                onClick={() => inviteMutation.mutate()}
              >
                Enviar Invitación
              </Button>
            </div>
          }
        >
          {inviteError && <BannerError error={inviteError} status={inviteError.status} />}
          <div className="space-y-4">
            <Input
              label="Correo Electrónico Corporativo *"
              type="email"
              required
              placeholder="operador@crmcontable.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nombres *"
                placeholder="Carlos"
                value={newNombres}
                onChange={(e) => setNewNombres(e.target.value)}
              />
              <Input
                label="Apellidos"
                placeholder="Gómez"
                value={newApellidos}
                onChange={(e) => setNewApellidos(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
                Rol de Autorización *
              </label>
              <select
                value={newIdRol}
                onChange={(e) => setNewIdRol(e.target.value)}
                className="w-full h-[38px] px-3 bg-white text-xs border border-[#e2e8f0] rounded-md focus:border-[#1d63ed]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo === 'ADMIN' ? 'Administrador (Control Total)' : 'Usuario (Operador)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
