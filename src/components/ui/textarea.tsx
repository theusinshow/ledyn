import * as React from 'react';
import { cn } from '@/shared/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[10rem] w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-[0.8125rem] shadow-xs placeholder:text-muted-foreground transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
