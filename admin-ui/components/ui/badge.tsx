import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-[#a5d6a7] bg-[#e8f5e9] text-[#1b5e20]',
        info: 'border-[#90caf9] bg-[#e3f2fd] text-[#0d47a1]',
        warning: 'border-[#ffcc80] bg-[#fff3e0] text-[#e65100]',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-muted-foreground bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
