'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { getAccessToken } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      const currentPath = window.location.pathname;
      router.push(`/auth/login?next=${encodeURIComponent(currentPath)}`);
    } else {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1d63ed]" />
        <span className="text-xs text-[#64748b] font-medium">Validando sesión...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Sidebar fijo (no se imprime) */}
      <div className="print:hidden">
        <Sidebar />
      </div>

      {/* Main Content Area desplazado a la derecha del sidebar */}
      <div className="flex-1 flex flex-col pl-[72px] lg:pl-[260px] print:pl-0 min-w-0 transition-all duration-300">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 p-6 print:p-0 max-w-[1600px] w-full mx-auto animate-in fade-in duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
