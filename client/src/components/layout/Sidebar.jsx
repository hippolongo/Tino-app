import { Building2 } from 'lucide-react'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

function Sidebar({ navItems, activeRoute, onRouteChange, mobile = false }) {
  return (
    <aside
      className={
        mobile
          ? 'flex h-full w-full flex-col bg-white'
          : 'hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col'
      }
    >
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Building2 className="h-5 w-5 text-blue-900" />
          <span className="font-semibold">Doves Holdings</span>
        </div>
      </div>
      <ScrollArea className="flex-1 p-3">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 text-slate-700',
                activeRoute === item.id && 'bg-blue-50 text-blue-900 hover:bg-blue-100',
              )}
              onClick={() => onRouteChange(item.id)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}

export default Sidebar

