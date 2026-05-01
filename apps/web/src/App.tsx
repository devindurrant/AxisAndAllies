import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.ts'
import LoginPage from './pages/LoginPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import LobbyPage from './pages/LobbyPage.tsx'
import GamePage from './pages/GamePage.tsx'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-usa border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <LobbyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:id"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
