import { cn } from '../../lib/utils'

function Badge({ className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }

