import { cn } from '../../lib/utils'

function Table({ className, ...props }) {
  return <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
}

function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableRow({ className, ...props }) {
  return <tr className={cn('border-b border-slate-200 transition-colors hover:bg-slate-50', className)} {...props} />
}

function TableHead({ className, ...props }) {
  return <th className={cn('h-10 px-3 text-left align-middle font-semibold text-slate-700', className)} {...props} />
}

function TableCell({ className, ...props }) {
  return <td className={cn('p-3 align-middle', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }

