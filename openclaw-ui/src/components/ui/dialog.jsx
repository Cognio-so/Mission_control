import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../../lib/utils.js'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-[#04140f]/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

export const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'w-full max-w-2xl max-h-[calc(100vh-2rem)] overscroll-contain overflow-y-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-panel)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
))
DialogContent.displayName = 'DialogContent'

export const DialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col gap-2', className)} {...props} />
)
export const DialogFooter = ({ className, ...props }) => (
  <div className={cn('flex flex-wrap items-center justify-end gap-2', className)} {...props} />
)

export const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-strong', className)} {...props} />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted', className)} {...props} />
))
DialogDescription.displayName = 'DialogDescription'
