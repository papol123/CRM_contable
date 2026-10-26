import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, disabled, children, icon, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none';

    const sizeStyles = {
      sm: 'h-8 px-2.5 text-xs rounded-md gap-1.5',
      md: 'h-9 px-4 text-sm rounded-lg gap-2',
      lg: 'h-11 px-6 text-base rounded-lg gap-2.5',
    };

    const variantStyles = {
      primary: 'bg-[#1d63ed] text-white hover:bg-[#1550c0] active:bg-[#0f3ea9] shadow-sm',
      secondary: 'bg-[#eff4ff] text-[#1d63ed] hover:bg-[#dce9ff]',
      outline: 'bg-white text-[#0f172a] border border-[#e2e8f0] hover:bg-[#f8fafc]',
      destructive: 'bg-[#ef4444] text-white hover:bg-[#dc2626]',
      ghost: 'bg-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
