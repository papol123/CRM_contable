import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substring(7);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-[#0f172a] uppercase tracking-wider">
            {label} {props.required && <span className="text-[#ef4444]">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-[#64748b] pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full h-[38px] px-3 bg-white text-sm text-[#0f172a] placeholder-[#94a3b8] border rounded-md transition-all duration-150 focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-[#1d63ed]/15 disabled:bg-[#f8fafc] disabled:text-[#94a3b8] disabled:cursor-not-allowed ${
              leftIcon ? 'pl-9' : ''
            } ${rightIcon ? 'pr-9' : ''} ${
              error ? 'border-[#ef4444] focus:border-[#ef4444] focus:ring-[#ef4444]/15' : 'border-[#e2e8f0]'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-[#64748b] flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-[#ef4444] font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-[#64748b]">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
