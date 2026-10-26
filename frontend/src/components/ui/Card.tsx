import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, subtitle, action }) => {
  return (
    <div className={`bg-white border border-[#e2e8f0] rounded-lg shadow-card overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0] bg-white">
          <div>
            {title && <h3 className="text-base font-semibold text-[#0f172a]">{title}</h3>}
            {subtitle && <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, badge, className = '' }) => {
  return (
    <div className={`bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-card flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">{title}</span>
        {icon && <div className="text-[#1d63ed]">{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-[#0f172a] tabular-nums tracking-tight">{value}</div>
        {badge && <div>{badge}</div>}
      </div>
      {subtitle && <p className="text-xs text-[#64748b] mt-1.5">{subtitle}</p>}
    </div>
  );
};
