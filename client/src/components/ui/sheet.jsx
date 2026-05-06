import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close

function SheetContent({ className, children, ...props }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
      <Dialog.Content
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white p-4 shadow-xl',
          className,
        )}
        {...props}
      >
        {children}
        <SheetClose className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </SheetClose>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent }

