'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/Toast';

function SessionWarningListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handleWarning = () => {
      toast({
        type: 'info',
        title: 'Sesión por expirar',
        message: 'Tu sesión vencerá en 2 minutos. Guarda tu trabajo para evitar pérdida de datos.',
      });
    };

    window.addEventListener('session-expiring-warning', handleWarning);
    return () => window.removeEventListener('session-expiring-warning', handleWarning);
  }, [toast]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error: any) => {
              // No reintentar en 401, 403, 404, 422
              if (error?.status && [401, 403, 404, 422].includes(error.status)) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionWarningListener />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
