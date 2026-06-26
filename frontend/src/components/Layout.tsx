import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import {
  LayoutDashboard, Clock, Users, BarChart3,
  LogOut, Building2, ChevronRight, Settings, ShieldCheck, Menu, X, Palette, Mail, UserCircle2,
} from 'lucide-react';

const mainNav = [
  { to: '/',          label: 'Dashboard',  icon: LayoutDashboard, exact: true },
  { to: '/attendance',label: 'Attendance', icon: Clock },
  { to: '/profile',   label: 'My Account', icon: UserCircle2 },
  { to: '/reports',   label: 'Reports',    icon: BarChart3,   roles: ['admin'] },
  { to: '/users',     label: 'Users',      icon: Users,       roles: ['admin'] },
  { to: '/audit',     label: 'Audit Log',  icon: ShieldCheck, roles: ['admin'] },
  { to: '/settings',  label: 'Settings',   icon: Settings,    roles: ['admin'] },
];

const settingsNav = [
  { to: '/settings/branding', label: 'Branding',     icon: Palette },
  { to: '/settings/smtp',     label: 'Email / SMTP', icon: Mail    },
];

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  user:  'bg-emerald-100 text-emerald-700',
};

function NavItem({ to, label, icon: Icon, exact, onClick }: {
  to: string; label: string; icon: React.ElementType; exact?: boolean; onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className="shrink-0" />
          <span className="flex-1">{label}</span>
          {isActive && <ChevronRight size={14} className="opacity-40" />}
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { branding }     = useBranding();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const onSettings = location.pathname.startsWith('/settings');

  const handleLogout = () => { logout(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {branding.logo ? (
            <img src={branding.logo} alt="Logo" className="h-12 max-w-[180px] object-contain" />
          ) : (
            <>
              <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-900 font-semibold text-sm leading-tight">Vendor</p>
                <p className="text-gray-400 text-xs">Attendance System</p>
              </div>
            </>
          )}
        </div>
        <button onClick={closeSidebar} className="md:hidden text-gray-400 hover:text-gray-600 p-1 shrink-0">
          <X size={20} />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {mainNav
          .filter(item => !item.roles || item.roles.includes(user?.role || ''))
          .map(item => (
            <NavItem key={item.to} {...item} onClick={closeSidebar} />
          ))}

        {/* Mobile-only: inline settings sub-items */}
        {onSettings && (
          <div className="md:hidden ml-4 pl-3 border-l-2 border-gray-100 space-y-0.5 pt-1">
            {settingsNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'text-blue-700 font-medium bg-blue-50'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-gray-200 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
            <span className="text-blue-700 text-sm font-semibold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 text-sm font-medium truncate">{user?.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColors[user?.role || 'user']}`}>
              {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={closeSidebar} />
      )}

      {/* Main sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:shrink-0
      `}>
        <SidebarContent />
      </aside>

      {/* Settings sub-sidebar — desktop only, appears when on /settings/* */}
      {onSettings && (
        <aside className="hidden md:flex w-48 bg-white border-r border-gray-200 flex-col shrink-0">
          <div className="px-4 py-5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Settings</p>
          </div>
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {settingsNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={16} className="shrink-0" />
                    <span className="flex-1">{label}</span>
                    {isActive && <ChevronRight size={13} className="opacity-40" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700 p-1">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {branding.logo ? (
              <img src={branding.logo} alt="Logo" className="h-9 max-w-[140px] object-contain" />
            ) : (
              <>
                <div className="w-7 h-7 bg-blue-500 rounded-md flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-gray-900 font-semibold text-sm">Vendor Attendance</span>
              </>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
