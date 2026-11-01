import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Button, Field, Input, useToast } from '../../components/ui'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    date_of_birth: user?.customer_profile?.date_of_birth || '',
    gender: user?.customer_profile?.gender || '',
  })
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => (await api.patch('/profile', {
      name: form.name,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
    })).data,
    onSuccess: (data) => {
      setUser(data.user)
      push('Profile updated.')
    },
    onError: (err) => setError(apiError(err, 'Your profile could not be updated.')),
  })

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-base font-bold text-slate-900">Profile details</h2>
        <p className="mt-1 text-xs text-slate-500">Your name and phone are used on delivery paperwork and order notifications.</p>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate() }} className="mt-4 space-y-3">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} />
            </Field>
            <Field label="Email address" hint="Contact support if you need to change your email.">
              <Input value={user?.email || ''} disabled />
            </Field>
            <Field label="Mobile number" hint="Format: 01XXXXXXXXX">
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01XXXXXXXXX" maxLength={20} />
            </Field>
            <Field label="Date of birth">
              <Input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Gender">
              <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>Save changes</Button>
          </div>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-bold text-slate-900">Account security</h2>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-slate-400">Role</dt><dd className="mt-0.5 font-semibold text-slate-700">{user?.role_label}</dd></div>
          <div><dt className="text-slate-400">Account status</dt><dd className="mt-0.5 font-semibold capitalize text-slate-700">{user?.status}</dd></div>
          <div><dt className="text-slate-400">Member since</dt><dd className="mt-0.5 text-slate-700">{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</dd></div>
        </dl>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Password changes are available through the <a href="/forgot-password" className="link">password reset flow</a>. Contact marketplace support if you are locked out.
        </p>
      </div>
    </div>
  )
}
