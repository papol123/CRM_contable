import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  showAction?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  showAction = true,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center bg-white border border-dashed border-[#cbd5e1] rounded-xl max-w-lg mx-auto my-6">
      <div className="w-12 h-12 rounded-full bg-[#f1f5f9] flex items-center justify-center text-[#64748b] mb-4">
        {icon || <PackageOpen className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-[#0f172a] mb-1">{title}</h3>
      <p className="text-sm text-[#64748b] mb-6 max-w-sm leading-relaxed">{description}</p>
      {showAction && actionLabel && onAction && (
        <Button onClick={onAction} icon={actionIcon} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
