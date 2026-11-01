import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, apiError } from '../lib/api'
import { Button, ErrorState, Loading, useToast } from '../components/ui'

export default function UnsubscribePage() {
  const { token = '' } = useParams()
  const { push } = useToast()
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api.get(`/newsletter/status/${token}`)
      .then(({ data }) => {
        if (!active) return
        setEmail(data.subscriber.email)
        setStatus(data.subscriber.status === 'unsubscribed' ? 'done' : 'ready')
        if (data.subscriber.status === 'unsubscribed') setMessage('This email address is already unsubscribed.')
      })
      .catch(() => active && setStatus('invalid'))
    return () => { active = false }
  }, [token])

  async function unsubscribe() {
    setSaving(true)
    try {
      const { data } = await api.post(`/newsletter/unsubscribe/${token}`)
      setEmail(data.email)
      setMessage(data.message)
      setStatus('done')
      push('You have been unsubscribed.')
    } catch (error) {
      push(apiError(error, 'We could not unsubscribe this address.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <Loading label="Checking your subscription…" />

  if (status === 'invalid') {
    return (
      <div className="container-page py-12">
        <ErrorState message="This unsubscribe link is invalid or has expired. If you still receive marketing email, contact support and we will remove you manually." />
        <div className="mt-4 text-center"><Link to="/" className="link text-sm">Back to the storefront</Link></div>
      </div>
    )
  }

  return (
    <div className="container-page py-10 sm:py-16">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-8 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">Email preferences</p>
          <h1 className="mt-1 text-2xl font-bold">Unsubscribe from marketing email</h1>
          <p className="mt-2 text-sm text-white/85">Order updates, payment confirmations, and security notices are transactional and will still be sent when needed.</p>
        </div>
        <div className="px-6 py-7">
          {status === 'done' ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
              <h2 className="mt-3 text-lg font-bold text-slate-900">You are unsubscribed</h2>
              <p className="mt-1 text-sm text-slate-600">{message || `${email} will no longer receive marketing email.`}</p>
              <Link to="/" className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Back to the storefront</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">We are about to unsubscribe <strong className="text-slate-900">{email}</strong> from newsletters, deals, and campaign email.</p>
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                You will still receive essential messages about orders, payments, returns, and account security.
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="danger" loading={saving} onClick={unsubscribe}>Unsubscribe me</Button>
                <Link to="/" className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Keep my subscription</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
