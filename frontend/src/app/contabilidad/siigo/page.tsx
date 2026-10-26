'use client';

import React from 'react';
import Link from 'next/link';
import { RefreshCw, ShieldCheck, AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function SiigoPage() {
  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 pb-4 border-b border-[#e2e8f0]">
          <Link href="/contabilidad">
            <button className="p-2 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">Conector e Integraciones Externas</h1>
            <p className="text-xs text-[#64748b]">
              Sincronización de libros contables y reversas compensatorias
            </p>
          </div>
        </div>

        {/* Tarjeta de estado */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-card space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#ecfdf5] rounded-xl text-[#10b981]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0f172a]">Seguridad de Credenciales</h3>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Protección de secretos contables según normativa GCP Secret Manager
                </p>
              </div>
            </div>
            <Badge variant="active">Seguro</Badge>
          </div>

          <p className="text-xs text-[#424655] leading-relaxed">
            De acuerdo con las directrices de seguridad de la arquitectura (GEMINI §5.8), las credenciales y tokens de integración no se exponen ni modifican desde el navegador. La sincronización se ejecuta directamente desde los servicios de Cloud Run.
          </p>

          <div className="pt-2 flex items-center gap-3">
            <Link href="/contabilidad/cierre">
              <Button size="sm" variant="outline">
                Ir a Cierre Contable
              </Button>
            </Link>
            <Link href="/facturacion/ventas">
              <Button size="sm" variant="outline">
                Ver Remisiones y Reversas
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
