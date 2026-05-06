import { cn } from '../../lib/utils'

function Card({ className, ...props }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props} />
}

function CardHeader({ className, ...props }) {
  return <div className={cn('p-5 pb-3', className)} {...props} />
}

function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-lg font-semibold text-slate-900', className)} {...props} />
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent }

