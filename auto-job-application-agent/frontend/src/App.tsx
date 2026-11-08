import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { JobsPage } from './pages/JobsPage'
import { MatchesPage } from './pages/MatchesPage'
import { ApplicationsPage } from './pages/ApplicationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AgentRunsPage } from './pages/AgentRunsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/agent-runs" element={<AgentRunsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
