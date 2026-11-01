import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiError } from '../lib/api'
import { usePublicSettings } from '../lib/settings'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input } from '../components/ui'

export default function LoginPage() {
  const { login } = useAuth()
  const { data: settings } = usePublicSettings()
  const storeName = settings?.store_name || 'Marketplace'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      const destination = user.role === 'admin' || ['manager', 'support'].includes(user.role || '')
        ? (next === '/' ? '/admin' : next)
        : user.role === 'seller' && next === '/'
          ? '/seller'
          : next
      navigate(destination, { replace: true })
    } catch (err) {
      setError(apiError(err, 'Sign in failed. Check your email and password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-brand-800 p-7 text-white sm:flex">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">{storeName}</p>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight">Welcome back to your marketplace.</h1>
            <p className="mt-2 text-sm text-slate-300">Track orders, manage addresses, save products, and reach seller support — all in one place.</p>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            <li>✓ COD, bKash, Nagad &amp; Rocket nationwide</li>
            <li>✓ Verified sellers only</li>
            <li>✓ Transparent order tracking</li>
          </ul>
        </div>
        <div className="p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-xs text-slate-500">Use the email and password for your account.</p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <Field label="Email address" required>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </Field>
            <Field label="Password" required>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Sessions are protected by CSRF tokens.</span>
              <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={loading}>Sign in</Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            New to {storeName}? <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-600 hover:underline">Create an account</Link>
          </p>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
            By signing in you agree to the marketplace terms and returns policy. Never share your password or one-time codes with anyone.
          </p>
        </div>
      </div>
    </div>
  )
}
