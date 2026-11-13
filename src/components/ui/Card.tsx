import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  isPressable?: boolean;
  isHoverable?: boolean;
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | '2xl';
}

export const Card: React.FC<CardProps> = ({
  children,
  isPressable = false,
  isHoverable = true,
  shadow = 'sm',
  radius = '2xl',
  className = '',
  ...props
}) => {
  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  }[shadow];

  const radiusClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    '2xl': 'rounded-2xl',
  }[radius];

  const hoverClasses = isHoverable
    ? 'hover:shadow-md hover:border-slate-300 dark:hover:border-zinc-700 transition-all duration-300'
    : '';

  const pressableClasses = isPressable
    ? 'cursor-pointer active:scale-[0.99]'
    : '';

  return (
    <div
      className={`bg-white dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800/80 overflow-hidden flex flex-col ${radiusClasses} ${shadowClasses} ${hoverClasses} ${pressableClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`p-4 pb-2 flex items-center justify-between ${className}`} {...props}>
    {children}
  </div>
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`p-4 py-2 flex-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`p-4 pt-2 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-xs ${className}`} {...props}>
    {children}
  </div>
);
