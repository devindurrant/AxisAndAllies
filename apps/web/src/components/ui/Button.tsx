import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  isLoading?: boolean
  className?: string
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-usa text-white hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400',
  secondary:
    'bg-gray-600 text-white hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500',
  danger:
    'bg-red-700 text-white hover:bg-red-600 disabled:bg-red-900 disabled:text-red-400',
  ghost:
    'bg-transparent text-gray-300 hover:text-white hover:bg-white/10 disabled:text-gray-600',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-base rounded-lg',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#16213e] focus:ring-usa cursor-pointer disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {isLoading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
