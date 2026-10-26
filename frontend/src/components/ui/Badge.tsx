import React from 'react';

export type BadgeVariant = 'active' | 'pending' | 'inactive' | 'error' | 'primary';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  showDot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'inactive',
  children,
  showDot = true,
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    active: {
      container: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]',
      dot: 'bg-[#10b981]',
    },
    pending: {
      container: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',
      dot: 'bg-[#f59e0b]',
    },
    inactive: {
      container: 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]',
      dot: 'bg-[#94a3b8]',
    },
    error: {
      container: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
      dot: 'bg-[#ef4444]',
    },
    primary: {
      container: 'bg-[#eff4ff] text-[#1d63ed] border-[#b3c5ff]',
      dot: 'bg-[#1d63ed]',
    },
  };

  const current = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 text-xs font-medium rounded-full border ${current.container} select-none ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} />}
      <span className="truncate">{children}</span>
    </span>
  );
};
