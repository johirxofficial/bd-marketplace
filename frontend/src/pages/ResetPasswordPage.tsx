import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiError } from '../lib/api'
import { Button, Field, Input } from '../components/ui'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') || '')
  const [token, setToken] = useState(params.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email,
        token,
        password,
        password_confirmation: confirmation,
      })
      setDone(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (err) {
      setError(apiError(err, 'The password could not be reset. The link may have expired.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-xs text-slate-500">Reset links expire for security. If yours has expired, request a new one.</p>
        {done ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Your password has been reset. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <Field label="Email address" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Reset token" required hint="Provided in the reset link.">
              <Input value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
            <Field label="New password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" required>
              <Input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>Reset password</Button>
          </form>
        )}
        <p className="mt-3 text-center text-xs"><Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  )
}
