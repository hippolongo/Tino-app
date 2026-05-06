import { Menu, UserCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet'
import Sidebar from './Sidebar'

function Topbar({
  title,
  subtitle,
  userEmail,
  role,
  navItems,
  activeRoute,
  onRouteChange,
  onOpenProfile,
  onLogout,
  loading,
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <Sidebar mobile navItems={navItems} activeRoute={activeRoute} onRouteChange={onRouteChange} />
            </SheetContent>
          </Sheet>
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 md:inline-flex">
            {userEmail} {role ? `• ${role}` : ''}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <UserCircle2 className="mr-1 h-4 w-4" />
                Account
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenProfile}>Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout} disabled={loading}>
                {loading ? 'Please wait...' : 'Log out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

export default Topbar

