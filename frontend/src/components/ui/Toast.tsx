import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string, action?: ToastItem['action']) => void;
  error: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, title, message, action }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, type, title, message, action }]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string, action?: ToastItem['action']) => {
      toast({ type: 'success', title, message, action });
    },
    [toast]
  );

  const error = useCallback(
    (title: string, message?: string) => {
      toast({ type: 'error', title, message });
    },
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-4 rounded-lg shadow-modal border flex items-start gap-3 transition-all animate-in slide-in-from-bottom-2 ${
              t.type === 'success'
                ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]'
                : t.type === 'error'
                ? 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
                : 'bg-[#eff4ff] border-[#b3c5ff] text-[#1d63ed]'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0 mt-0.5" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-[#ef4444] shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-[#1d63ed] shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{t.title}</h4>
              {t.message && <p className="text-xs opacity-90 mt-0.5">{t.message}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    removeToast(t.id);
                  }}
                  className="mt-2 text-xs font-semibold underline hover:opacity-80"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="p-1 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
