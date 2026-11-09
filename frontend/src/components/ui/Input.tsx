import React, { useState } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/**
 * Normaliza lo digitado a un número con punto decimal, con la convención colombiana:
 * la coma es el decimal y el punto separa miles ("1.250.000" → 1250000, "2,5" → 2.5).
 * Sin coma, un único punto con 1 o 2 decimales se toma como decimal ("9.66", "2.5"),
 * pero con 3 dígitos detrás es separador de miles ("1.250" → 1250).
 * El signo menos solo se permite si el campo admite negativos.
 */
export function limpiarNumero(texto: string, admiteNegativos: boolean): string {
  let limpio = texto.replace(admiteNegativos ? /[^\d.,-]/g : /[^\d.,]/g, '');
  if (limpio.includes(',')) {
    limpio = limpio.replace(/\./g, '');
    const coma = limpio.indexOf(',');
    limpio = limpio.slice(0, coma) + '.' + limpio.slice(coma + 1).replace(/,/g, '');
  } else {
    const puntos = (limpio.match(/\./g) || []).length;
    if (puntos > 1 || /^-?\d+\.\d{3}$/.test(limpio)) limpio = limpio.replace(/\./g, '');
  }
  if (admiteNegativos) limpio = limpio.replace(/(?!^)-/g, '');
  return limpio;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substring(7);

    // Campos numéricos: texto con teclado numérico, sin flechas ni el 0 pegado.
    // Mientras se escribe se conserva lo digitado ("2.", "0,5"); al salir se muestra el valor.
    const esNumero = props.type === 'number';
    const [borrador, setBorrador] = useState<string | null>(null);
    let propsCampo: React.InputHTMLAttributes<HTMLInputElement> = props;
    if (esNumero) {
      const { type, value, onChange, onFocus, onBlur, placeholder, min, step, ...resto } = props;
      const admiteNegativos = min === undefined || Number(min) < 0;
      const valorTexto = value === undefined || value === null ? '' : String(value);
      const mostrado = borrador ?? (valorTexto === '0' ? '' : valorTexto);
      propsCampo = {
        ...resto,
        type: 'text',
        inputMode: 'decimal',
        autoComplete: 'off',
        placeholder: placeholder ?? '0',
        value: mostrado,
        onFocus: (e) => {
          setBorrador(mostrado);
          onFocus?.(e);
        },
        onBlur: (e) => {
          setBorrador(null);
          onBlur?.(e);
        },
        onChange: (e) => {
          const limpio = limpiarNumero(e.target.value, admiteNegativos);
          e.target.value = limpio;
          setBorrador(limpio);
          onChange?.(e);
        },
      };
    }

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
            } ${esNumero ? 'tabular-nums' : ''} ${className}`}
            {...propsCampo}
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
