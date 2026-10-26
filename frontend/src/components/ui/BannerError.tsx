import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ProblemDetails } from '@/lib/api';

export interface BannerErrorProps {
  error: ProblemDetails | Error | string | null;
  status?: number;
  onDismiss?: () => void;
  rceAction?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'outline';
  };
  className?: string;
}

export const BannerError: React.FC<BannerErrorProps> = ({
  error,
  status,
  onDismiss,
  rceAction,
  className = '',
}) => {
  if (!error) return null;

  let title = 'Error';
  let detail = '';
  let statusCode = status;
  let errorsList: string[] = [];

  if (typeof error === 'string') {
    detail = error;
  } else if ('problem' in error && typeof error.problem === 'object') {
    const prob = (error as { problem: ProblemDetails }).problem;
    title = prob.title || 'Error en la solicitud';
    detail = prob.detail || '';
    statusCode = prob.status || status;
    if (Array.isArray(prob.errors)) {
      errorsList = prob.errors.map((e) => (typeof e === 'string' ? e : e.message));
    }
  } else if ('type' in error) {
    const prob = error as ProblemDetails;
    title = prob.title || 'Error en la solicitud';
    detail = prob.detail || '';
    statusCode = prob.status || status;
    if (Array.isArray(prob.errors)) {
      errorsList = prob.errors.map((e) => (typeof e === 'string' ? e : e.message));
    }
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div
      role="alert"
      className={`w-full bg-[#fef2f2] border border-[#fecaca] rounded-lg p-4 transition-all duration-150 text-[#991b1b] flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#ef4444] shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-semibold text-[#991b1b]">
            {statusCode ? `Error ${statusCode}: ` : ''}
            {title}
          </div>
          {detail && <div className="text-xs text-[#7f1d1d] leading-relaxed">{detail}</div>}
          {errorsList.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs text-[#7f1d1d] space-y-0.5">
              {errorsList.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
        {rceAction && (
          <button
            type="button"
            onClick={rceAction.onClick}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              rceAction.variant === 'outline'
                ? 'bg-white border border-[#fca5a5] text-[#991b1b] hover:bg-[#fee2e2]'
                : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
            }`}
          >
            {rceAction.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar alerta"
            className="p-1 rounded-md text-[#991b1b] hover:bg-[#fee2e2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
