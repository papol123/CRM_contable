'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  Receipt,
  BookOpen,
  DollarSign,
  Calculator,
  Lock,
  RefreshCw,
  Settings,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { can, getCurrentUser } from '@/lib/auth';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  permission?: string;
  adminOnly?: boolean;
  subItems?: Array<{
    title: string;
    href: string;
    permission?: string;
    adminOnly?: boolean;
  }>;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const user = getCurrentUser();
  const isAdmin = user?.rol === 'ADMIN';

  const navItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
    },
    {
      title: 'Clientes',
      href: '/clientes',
      icon: <Users className="w-5 h-5 shrink-0" />,
      permission: 'terceros.consultar',
    },
    {
      title: 'Proveedores',
      href: '/proveedores',
      icon: <Building2 className="w-5 h-5 shrink-0" />,
      permission: 'terceros.consultar',
    },
    {
      title: 'Inventario',
      href: '/inventario',
      icon: <Package className="w-5 h-5 shrink-0" />,
      permission: 'inventario.consultar',
    },
    {
      title: 'Facturación / Remisiones',
      href: '/facturacion/ventas',
      icon: <Receipt className="w-5 h-5 shrink-0" />,
      permission: 'ventas.consultar',
    },
    {
      title: 'Contabilidad',
      href: '/contabilidad',
      icon: <BookOpen className="w-5 h-5 shrink-0" />,
      subItems: [
        { title: 'Cartera y Pagos', href: '/contabilidad/cartera', permission: 'cartera.consultar' },
        { title: 'Nómina', href: '/contabilidad/nomina', adminOnly: true, permission: 'nomina.consultar' },
        { title: 'Cierre Contable', href: '/contabilidad/cierre', adminOnly: true, permission: 'cierres.ejecutar' },
        { title: 'Siigo y Reversas', href: '/contabilidad/siigo', adminOnly: true },
      ],
    },
    {
      title: 'Configuración',
      href: '/configuracion/usuarios',
      icon: <Settings className="w-5 h-5 shrink-0" />,
      adminOnly: true,
      subItems: [
        { title: 'Usuarios y Roles', href: '/configuracion/usuarios', adminOnly: true },
        { title: 'Catálogos y Consecutivos', href: '/configuracion/catalogos', adminOnly: true },
      ],
    },
  ];

  const filterItem = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  };

  return (
    <aside
      className={`fixed top-0 left-0 z-30 h-screen bg-[#0f172a] text-[#94a3b8] border-r border-[#1e293b] flex flex-col justify-between transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      {/* Brand & Logo Header */}
      <div className="h-[60px] flex items-center justify-between px-4 border-b border-[#1e293b] bg-[#0f172a]">
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#1d63ed] flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              AL
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white tracking-tight leading-tight truncate">
                Apex Ledger
              </span>
              <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-medium truncate">
                ERP Automotriz
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 mx-auto rounded-lg bg-[#1d63ed] flex items-center justify-center text-white font-bold text-sm">
            AL
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-md text-[#64748b] hover:text-white hover:bg-[#162032] transition-colors ${
            collapsed ? 'hidden' : 'block'
          }`}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.filter(filterItem).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <div key={item.title} className="space-y-1">
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#162032] text-white border border-[#1e293b] shadow-sm'
                    : 'text-[#94a3b8] hover:bg-[#162032]/60 hover:text-white'
                }`}
                title={collapsed ? item.title : undefined}
              >
                <span className={isActive ? 'text-[#1d63ed]' : 'text-[#64748b]'}>{item.icon}</span>
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>

              {/* Subitems if not collapsed */}
              {!collapsed && item.subItems && (
                <div className="ml-8 pl-2 border-l border-[#1e293b] space-y-1 py-1">
                  {item.subItems
                    .filter((sub) => {
                      if (sub.adminOnly && !isAdmin) return false;
                      if (sub.permission && !can(sub.permission)) return false;
                      return true;
                    })
                    .map((sub) => {
                      const isSubActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.title}
                          href={sub.href}
                          className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                            isSubActive
                              ? 'bg-[#1d63ed]/15 text-[#1d63ed] font-semibold'
                              : 'text-[#64748b] hover:text-white hover:bg-[#162032]'
                          }`}
                        >
                          {sub.title}
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer / Toggle & User Badge */}
      <div className="p-3 border-t border-[#1e293b] bg-[#0f172a] space-y-2">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#162032]"
            title="Expandir menú"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="p-2.5 rounded-lg bg-[#162032] border border-[#1e293b] flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#1e293b] flex items-center justify-center text-xs font-semibold text-white">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-semibold text-white truncate">{user?.email || 'Sesión activa'}</span>
                <span className="text-[10px] text-[#94a3b8] flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3 h-3 text-[#10b981]" />
                  {isAdmin ? 'Administrador' : 'Usuario'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
