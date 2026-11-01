import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loading } from './ui'

export function RequireAuth({ children, roles, staff }: { children: React.ReactNode; roles?: string[]; staff?: boolean }) {
  const { user, loading, isStaff } = useAuth()
  const location = useLocation()

  if (loading) return <Loading label="Checking your session…" />

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  if (staff && !isStaff) {
    return <Navigate to="/" replace />
  }

  if (roles && !roles.includes(user.role || '')) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
