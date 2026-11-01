import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'

type AuthValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (payload: { name: string; email: string; phone?: string; password: string; password_confirmation: string }) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: User | null) => void
  isStaff: boolean
  isSeller: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    setUser(data.user)
    return data.user as User
  }, [])

  const register = useCallback(async (payload: { name: string; email: string; phone?: string; password: string; password_confirmation: string }) => {
    const { data } = await api.post('/auth/register', payload)
    setUser(data.user)
    return data.user as User
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthValue>(() => ({
    user, loading, login, register, logout, refresh, setUser,
    isStaff: !!user && ['admin', 'manager', 'support'].includes(user.role || ''),
    isSeller: user?.role === 'seller',
    isAdmin: user?.role === 'admin',
  }), [user, loading, login, register, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
