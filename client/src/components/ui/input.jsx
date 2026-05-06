import { cn } from '../../lib/utils'

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-offset-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

