import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './components/layout/DashboardLayout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import MissionPage from './pages/MissionPage.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import ConversationsPage from './pages/ConversationsPage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import BoardsPage from './pages/BoardsPage.jsx'
import BoardDetailPage from './pages/BoardDetailPage.jsx'
import MarketplacePage from './pages/MarketplacePage.jsx'
import PluginsPage from './pages/PluginsPage.jsx'
import ScheduledPage from './pages/ScheduledPage.jsx'
import GatewaysPage from './pages/GatewaysPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import { AdminGate } from './components/auth/AdminGate.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/mission" element={<MissionPage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/scheduled" element={<ScheduledPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/boards/:boardId" element={<BoardDetailPage />} />
        <Route path="/skills" element={<Navigate to="/skills/marketplace" replace />} />
        <Route path="/skills/marketplace" element={<MarketplacePage />} />
        <Route path="/skills/plugins" element={<PluginsPage />} />
        <Route path="/gateways" element={<AdminGate><GatewaysPage /></AdminGate>} />
        <Route path="/organization" element={<AdminGate><SettingsPage /></AdminGate>} />
        <Route path="/settings" element={<AdminGate><SettingsPage /></AdminGate>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
