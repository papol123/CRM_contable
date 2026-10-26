import React from 'react';

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-[#e2e8f0] rounded-md ${className}`}
    />
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="w-full space-y-3">
      <div className="flex gap-4 p-3 bg-[#f8fafc] border-b border-[#e2e8f0] rounded-t-lg">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3 border-b border-[#e2e8f0]/60 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const KpiSkeleton: React.FC = () => {
  return (
    <div className="bg-white p-5 border border-[#e2e8f0] rounded-lg shadow-card flex flex-col gap-2">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-7 w-36" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
};
