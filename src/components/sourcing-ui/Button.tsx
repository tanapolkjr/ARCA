import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-ink-1 border border-line hover:bg-subtle',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-subtle hover:text-ink-1',
  danger: 'bg-transparent border border-transparent hover:bg-subtle text-[color:var(--c-red)]',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: Props) {
  const sizes = { sm: 'h-7 px-2 text-[12px]', md: 'h-9 px-3 text-[13px]', lg: 'h-10 px-4 text-[14px]' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
