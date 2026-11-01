import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiError } from '../lib/api'
import { Button, Field, Input } from '../components/ui'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      setMessage(data.message)
    } catch (err) {
      setError(apiError(err, 'The reset email could not be requested.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-xs text-slate-500">Enter the email address on your account and we will send a reset link if the account exists.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <Field label="Email address" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
        </form>
        <p className="mt-3 text-center text-xs"><Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link></p>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
          If the reset email does not arrive, check your spam folder and confirm the address is correct. If you still need help, contact marketplace support.
        </p>
      </div>
    </div>
  )
}
