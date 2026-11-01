import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiError } from '../lib/api'
import { usePublicSettings } from '../lib/settings'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input } from '../components/ui'

export default function RegisterPage() {
  const { register } = useAuth()
  const { data: settings } = usePublicSettings()
  const storeName = settings?.store_name || 'Marketplace'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', password_confirmation: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.password_confirmation) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await register({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        password_confirmation: form.password_confirmation,
      })
      navigate(next, { replace: true })
    } catch (err) {
      setError(apiError(err, 'Registration failed. Please review the form.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Join {storeName}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Create your customer account</h1>
        <p className="mt-1 text-xs text-slate-500">Shop from verified sellers with COD, bKash, Nagad, Rocket, and Bangla QR. You can apply to become a seller later.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} autoComplete="name" />
          </Field>
          <Field label="Email address" required>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Mobile number" hint="Optional. You can add or change it later in your profile.">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01XXXXXXXXX" maxLength={20} autoComplete="tel" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password" required hint="At least 8 characters with letters and numbers.">
              <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" required>
              <Input type="password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} required autoComplete="new-password" />
            </Field>
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>Create account</Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          Already registered? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-600 hover:underline">Sign in</Link>
        </p>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">
          By creating an account you agree to the marketplace terms and returns policy.
        </p>
      </div>
    </div>
  )
}
