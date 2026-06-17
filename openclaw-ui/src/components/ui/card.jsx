import * as React from 'react'
import { cn } from '../../lib/utils.js'

export const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg surface-card', className)} {...props} />
))
Card.displayName = 'Card'

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-6 pt-6', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-6 pb-6', className)} {...props} />
))
CardContent.displayName = 'CardContent'
