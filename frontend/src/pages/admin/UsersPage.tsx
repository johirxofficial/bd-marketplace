import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, timeAgo } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui'
import { UserAvatar } from '../../components/UserAvatar'

type AdminUser = {
  id: number
  name: string
  email: string
  phone?: string | null
  status: string
  role?: string
  role_label?: string
  avatar_url?: string | null
  last_login_at?: string | null
  created_at?: string
}

type AdminUserDetail = AdminUser & {
  email_verified_at?: string | null
  orders_count?: number
  support_tickets_count?: number
  conversations_count?: number
  seller_profile?: { business_name: string; status: string; store?: { id: number; name: string; slug: string; status: string } | null } | null
}

type Role = { id: number; name: string; label: string }

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [statusDialog, setStatusDialog] = useState<{ user: AdminUser; next: 'active' | 'suspended' } | null>(null)
  const [reason, setReason] = useState('')
  const [roleDialog, setRoleDialog] = useState<{ user: AdminUser; role: string } | null>(null)
  const [securityUser, setSecurityUser] = useState<AdminUser | null>(null)
  const [detailsForm, setDetailsForm] = useState({ name: '', email: '', phone: '' })
  const [passwordForm, setPasswordForm] = useState({ password: '', password_confirmation: '' })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users', role, status, term, page],
    queryFn: async () => (await api.get('/admin/users', { params: { role: role || undefined, status: status || undefined, search: term || undefined, page } })).data,
    placeholderData: keepPreviousData,
  })

  const users: AdminUser[] = data?.users?.data || []
  const meta = data?.users?.meta || { current_page: data?.users?.current_page, last_page: data?.users?.last_page, total: data?.users?.total }
  const roles: Role[] = data?.roles || []

  const updateStatus = useMutation({
    mutationFn: async () => (await api.patch(`/admin/users/${statusDialog?.user.id}/status`, {
      status: statusDialog?.next,
      reason: statusDialog?.next === 'suspended' ? reason : undefined,
    })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setStatusDialog(null)
      setReason('')
      push(result.message || 'User status updated.')
    },
    onError: (err) => push(apiError(err, 'The user status could not be changed.'), 'error'),
  })

  const updateRole = useMutation({
    mutationFn: async () => (await api.patch(`/admin/users/${roleDialog?.user.id}/role`, { role: roleDialog?.role })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setRoleDialog(null)
      push(result.message || 'User role updated.')
    },
    onError: (err) => push(apiError(err, 'The role could not be changed.'), 'error'),
  })

  const detail = useQuery({
    queryKey: ['admin-user', securityUser?.id],
    queryFn: async () => (await api.get(`/admin/users/${securityUser?.id}`)).data.user as AdminUserDetail,
    enabled: !!securityUser,
  })

  useEffect(() => {
    if (!detail.data) return
    setDetailsForm({ name: detail.data.name, email: detail.data.email, phone: detail.data.phone || '' })
  }, [detail.data])

  function openSecurity(user: AdminUser) {
    setSecurityUser(user)
    setDetailsForm({ name: user.name, email: user.email, phone: user.phone || '' })
    setPasswordForm({ password: '', password_confirmation: '' })
  }

  const saveDetails = useMutation({
    mutationFn: async () => (await api.patch(`/admin/users/${securityUser?.id}`, detailsForm)).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-user', securityUser?.id] })
      push(result.message || 'User details updated.')
    },
    onError: (err) => push(apiError(err, 'The user details could not be saved.'), 'error'),
  })

  const changePassword = useMutation({
    mutationFn: async () => (await api.patch(`/admin/users/${securityUser?.id}/password`, passwordForm)).data,
    onSuccess: (result) => {
      setPasswordForm({ password: '', password_confirmation: '' })
      push(result.message || 'Password updated.')
    },
    onError: (err) => push(apiError(err, 'The password could not be changed.'), 'error'),
  })

  const sendReset = useMutation({
    mutationFn: async () => (await api.post(`/admin/users/${securityUser?.id}/password-reset`)).data,
    onSuccess: (result) => push(result.message || 'Password reset link sent.', result.sent === false ? 'info' : 'success'),
    onError: (err) => push(apiError(err, 'The reset link could not be sent.'), 'error'),
  })

  const passwordReady = passwordForm.password.length >= 8
    && passwordForm.password === passwordForm.password_confirmation

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        subtitle="Manage account status and roles. Role changes take effect on the next request."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex min-w-[220px] flex-1 gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, or phone" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        <select className="input max-w-[150px]" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
          <option value="">Any role</option>
          {roles.map((item) => <option key={item.id} value={item.name}>{item.label}</option>)}
        </select>
        <select className="input max-w-[150px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {isLoading ? <Loading label="Loading users…" /> : error ? (
        <ErrorState message="Users could not be loaded." onRetry={() => refetch()} />
      ) : !users.length ? (
        <EmptyState title="No users matched" description="Adjust the filters or search term." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Joined</th><th></th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={user.name} role={user.role} roleLabel={user.role_label} avatarUrl={user.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">{user.name}</p>
                          <p className="truncate text-[10px] text-slate-400">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={user.role === 'admin' ? 'red' : user.role === 'seller' ? 'blue' : 'slate'}>{user.role_label || user.role || '—'}</Badge>
                    </td>
                    <td><Badge tone={user.status === 'active' ? 'green' : 'red'}>{user.status}</Badge></td>
                    <td className="text-[11px] text-slate-500">{user.last_login_at ? timeAgo(user.last_login_at) : 'Never'}</td>
                    <td className="text-[11px] text-slate-500">{date(user.created_at)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100" onClick={() => openSecurity(user)}>Manage</button>
                        <Link to={`/messages?user=${user.id}`} className="rounded-md px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50">Message</Link>
                        <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50" onClick={() => setRoleDialog({ user, role: user.role || 'customer' })}>Change role</button>
                        {user.status === 'active'
                          ? <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50" onClick={() => { setStatusDialog({ user, next: 'suspended' }); setReason('') }}>Suspend</button>
                          : <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => setStatusDialog({ user, next: 'active' })}>Reactivate</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} /></div>
        </div>
      )}

      <Modal open={!!statusDialog} onClose={() => setStatusDialog(null)} title={statusDialog?.next === 'suspended' ? 'Suspend user' : 'Reactivate user'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setStatusDialog(null)}>Cancel</Button>
          <Button size="sm" variant={statusDialog?.next === 'suspended' ? 'danger' : 'primary'} loading={updateStatus.isPending} disabled={statusDialog?.next === 'suspended' && reason.trim().length < 5} onClick={() => updateStatus.mutate()}>
            {statusDialog?.next === 'suspended' ? 'Suspend account' : 'Reactivate account'}
          </Button>
        </>
      }>
        {statusDialog && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{statusDialog.user.name}</p>
              <p className="text-slate-500">{statusDialog.user.email} · {statusDialog.user.role_label || statusDialog.user.role}</p>
            </div>
            {statusDialog.next === 'suspended' ? (
              <>
                <p className="text-xs text-slate-600">Suspending revokes API tokens and prevents sign-in. Historical orders and data are preserved.</p>
                <Field label="Reason" required hint="At least 5 characters. Recorded in the audit log.">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
                </Field>
              </>
            ) : (
              <p className="text-xs text-slate-600">Reactivating restores sign-in. The user's role is not changed.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!roleDialog} onClose={() => setRoleDialog(null)} title="Change user role" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setRoleDialog(null)}>Cancel</Button>
          <Button size="sm" loading={updateRole.isPending} onClick={() => updateRole.mutate()}>Save role</Button>
        </>
      }>
        {roleDialog && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{roleDialog.user.name}</p>
              <p className="text-slate-500">{roleDialog.user.email} · current role {roleDialog.user.role_label || roleDialog.user.role}</p>
            </div>
            <Field label="New role" required hint="Granting administrator or staff roles gives access to the administration area.">
              <select className="input" value={roleDialog.role} onChange={(e) => setRoleDialog((prev) => prev && { ...prev, role: e.target.value })}>
                {roles.map((item) => <option key={item.id} value={item.name}>{item.label}</option>)}
              </select>
            </Field>
            <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
              You cannot remove your own administrator role. The change is written to the audit log.
            </p>
          </div>
        )}
      </Modal>
      <Modal open={!!securityUser} onClose={() => setSecurityUser(null)} title="Manage user account" wide footer={
        <Button size="sm" variant="secondary" onClick={() => setSecurityUser(null)}>Close</Button>
      }>
        {securityUser && (
          <div className="space-y-4">
            {detail.isLoading ? <Loading label="Loading account…" /> : detail.error ? (
              <ErrorState message="This account could not be loaded." onRetry={() => detail.refetch()} />
            ) : detail.data && (
              <>
                <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <UserAvatar name={detail.data.name} role={detail.data.role} roleLabel={detail.data.role_label} avatarUrl={detail.data.avatar_url} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{detail.data.name}</p>
                      <Badge tone={detail.data.role === 'admin' ? 'red' : detail.data.role === 'seller' ? 'green' : detail.data.role === 'manager' ? 'indigo' : detail.data.role === 'support' ? 'blue' : 'slate'}>
                        {detail.data.role_label || detail.data.role}
                      </Badge>
                      <Badge tone={detail.data.status === 'active' ? 'green' : 'red'}>{detail.data.status}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{detail.data.email}{detail.data.phone ? ` · ${detail.data.phone}` : ''}</p>
                    {detail.data.seller_profile?.store && (
                      <p className="mt-0.5 text-[11px] text-slate-500">Store: {detail.data.seller_profile.store.name} ({detail.data.seller_profile.store.status})</p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                      <div><p className="text-slate-400">Joined</p><p className="font-semibold text-slate-700">{date(detail.data.created_at)}</p></div>
                      <div><p className="text-slate-400">Last login</p><p className="font-semibold text-slate-700">{detail.data.last_login_at ? timeAgo(detail.data.last_login_at) : 'Never'}</p></div>
                      <div><p className="text-slate-400">Orders</p><p className="font-semibold text-slate-700">{detail.data.orders_count ?? 0}</p></div>
                      <div><p className="text-slate-400">Conversations</p><p className="font-semibold text-slate-700">{detail.data.conversations_count ?? 0}</p></div>
                    </div>
                  </div>
                  <Link to={`/messages?user=${detail.data.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                    Message user
                  </Link>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <h3 className="text-sm font-bold text-slate-900">Account details</h3>
                    <p className="text-[10px] text-slate-400">Changing the email changes the sign-in address.</p>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Full name" required>
                      <Input value={detailsForm.name} onChange={(e) => setDetailsForm((prev) => ({ ...prev, name: e.target.value }))} />
                    </Field>
                    <Field label="Email address" required>
                      <Input type="email" value={detailsForm.email} onChange={(e) => setDetailsForm((prev) => ({ ...prev, email: e.target.value }))} />
                    </Field>
                    <Field label="Phone" hint="Bangladeshi mobile number, e.g. 01811000009.">
                      <Input value={detailsForm.phone} onChange={(e) => setDetailsForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" loading={saveDetails.isPending} onClick={() => saveDetails.mutate()}>Save details</Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <h3 className="text-sm font-bold text-slate-900">Password</h3>
                  <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-600">
                    Passwords are stored as one-way hashes, so the current password can never be viewed — not even by an administrator. You can set a new one or email the user a reset link.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="New password" hint="At least 8 characters, including letters and numbers.">
                      <Input type="password" autoComplete="new-password" value={passwordForm.password} onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="••••••••" />
                    </Field>
                    <Field label="Confirm new password" error={passwordForm.password_confirmation && passwordForm.password !== passwordForm.password_confirmation ? 'The passwords do not match.' : undefined}>
                      <Input type="password" autoComplete="new-password" value={passwordForm.password_confirmation} onChange={(e) => setPasswordForm((prev) => ({ ...prev, password_confirmation: e.target.value }))} placeholder="••••••••" />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="secondary" loading={sendReset.isPending} onClick={() => sendReset.mutate()}>Email reset link</Button>
                    <Button size="sm" loading={changePassword.isPending} disabled={!passwordReady} onClick={() => changePassword.mutate()}>Set password</Button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Setting a password signs the user out on other devices and sends them a “password changed” email. The action is recorded in the audit log.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
