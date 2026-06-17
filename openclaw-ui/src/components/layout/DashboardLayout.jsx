import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TooltipProvider } from '../ui/tooltip.jsx'
import { Topbar } from './Topbar.jsx'
import { Sidebar } from './Sidebar.jsx'

export function DashboardLayout() {
  const location = useLocation()
  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen bg-app text-strong">
        <Topbar />
        <div className="mx-auto flex w-full">
          <Sidebar />
          <main className="min-h-[calc(100vh-61px)] flex-1 bg-[linear-gradient(135deg,#fbf5e8_0%,#f6efdf_44%,#e5f4ee_100%)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname.split('/').slice(0, 3).join('/')}
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
