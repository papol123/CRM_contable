'use client';

import React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CreditCard,
  Calculator,
  Lock,
  ArrowRight,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function ContabilidadHubPage() {
  const modulos = [
    {
      title: 'Cartera y Recibos de Caja',
      description: 'Gestión de cobros, registro de abonos y control de mora de clientes.',
      href: '/contabilidad/cartera',
      icon: <CreditCard className="w-6 h-6 text-[#1d63ed]" />,
    },
    {
      title: 'Liquidación de Nómina',
      description: 'Cálculo de novedades, horas extras, desprendibles y dispersión salarial.',
      href: '/contabilidad/nomina',
      icon: <Calculator className="w-6 h-6 text-[#10b981]" />,
    },
    {
      title: 'Cierre Contable y Balances',
      description: 'Cierres mensuales inmutables, estados de resultados y exportaciones CSV.',
      href: '/contabilidad/cierre',
      icon: <Lock className="w-6 h-6 text-[#f59e0b]" />,
    },
    {
      title: 'Integración Externa y Reversas',
      description: 'Monitoreo de sincronizaciones contables y reversas compensatorias.',
      href: '/contabilidad/siigo',
      icon: <RefreshCw className="w-6 h-6 text-[#64748b]" />,
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">Módulo Contable y Financiero</h1>
          <p className="text-xs text-[#64748b]">
            Centro de operaciones fiscales, estados de tesorería y cierre de periodos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modulos.map((m) => (
            <Link key={m.title} href={m.href} className="group block">
              <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card hover:border-[#1d63ed] hover:shadow-md transition-all duration-150 flex items-start justify-between">
                <div className="space-y-2">
                  <div className="p-3 bg-[#f8fafc] group-hover:bg-[#eff4ff] rounded-lg w-fit transition-colors">
                    {m.icon}
                  </div>
                  <h3 className="text-base font-semibold text-[#0f172a] group-hover:text-[#1d63ed] transition-colors">
                    {m.title}
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed max-w-sm">
                    {m.description}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-[#94a3b8] group-hover:text-[#1d63ed] group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
