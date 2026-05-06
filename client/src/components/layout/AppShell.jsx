import Sidebar from './Sidebar'
import Topbar from './Topbar'

function AppShell({
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
  children,
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <Sidebar navItems={navItems} activeRoute={activeRoute} onRouteChange={onRouteChange} />
        <div className="min-w-0 flex-1">
          <Topbar
            title={title}
            subtitle={subtitle}
            userEmail={userEmail}
            role={role}
            navItems={navItems}
            activeRoute={activeRoute}
            onRouteChange={onRouteChange}
            onOpenProfile={onOpenProfile}
            onLogout={onLogout}
            loading={loading}
          />
          <section className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</section>
        </div>
      </div>
    </main>
  )
}

export default AppShell

