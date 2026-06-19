import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TooltipProvider } from '../ui/tooltip.jsx'
import { Topbar } from './Topbar.jsx'
import { Sidebar } from './Sidebar.jsx'

export function DashboardLayout() {
  const location = useLocation()
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-screen flex-col overflow-hidden bg-app text-strong">
        <Topbar />
        <div className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden">
          <Sidebar />
          <main className="app-bg min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname.split('/').slice(0, 3).join('/')}
                className="h-full min-h-full"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
