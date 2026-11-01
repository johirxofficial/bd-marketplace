import { Fragment, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { dateTime } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination } from '../../components/ui'

type AuditLog = {
  id: number
  action: string
  user?: { id: number; name: string; email: string } | null
  auditable_type?: string | null
  auditable_id?: number | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  ip_address?: string | null
  created_at?: string
}

export default function AdminAuditPage() {
  const [draft, setDraft] = useState({ action: '', user_id: '', from: '', to: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-audit', filters, page],
    queryFn: async () => (await api.get('/admin/audit-logs', { params: { ...filters, page } })).data.logs,
    placeholderData: keepPreviousData,
  })

  const logs: AuditLog[] = data?.data || []

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        subtitle="Immutable record of sensitive marketplace actions: seller decisions, order changes, payouts, and settings."
      />

      <form onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(1) }} className="card mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input placeholder="Action, e.g. seller.approved" value={draft.action} onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))} />
        <Input placeholder="User ID" inputMode="numeric" value={draft.user_id} onChange={(e) => setDraft((prev) => ({ ...prev, user_id: e.target.value.replace(/[^\d]/g, '') }))} />
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">From<input type="date" className="input mt-1" value={draft.from} onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))} /></label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">To<input type="date" className="input mt-1" value={draft.to} onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))} /></label>
        <div className="flex items-end gap-1.5">
          <Button type="submit" size="sm">Filter</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => { const empty = { action: '', user_id: '', from: '', to: '' }; setDraft(empty); setFilters(empty); setPage(1) }}>Reset</Button>
        </div>
      </form>

      {isLoading ? <Loading label="Loading audit log…" /> : error ? (
        <ErrorState message="The audit log could not be loaded." onRetry={() => refetch()} />
      ) : !logs.length ? (
        <EmptyState title="No audit entries" description="Actions performed by staff will be recorded here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Action</th><th>User</th><th>Subject</th><th>IP</th><th>When</th><th></th></tr></thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr>
                      <td>
                        <Badge tone={log.action.includes('deleted') || log.action.includes('rejected') || log.action.includes('suspended') ? 'red' : log.action.includes('approved') || log.action.includes('paid') ? 'green' : 'slate'}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="text-xs">
                        {log.user ? <><p className="font-medium text-slate-700">{log.user.name}</p><p className="text-[10px] text-slate-400">{log.user.email}</p></> : <span className="text-slate-400">System</span>}
                      </td>
                      <td className="text-[11px] text-slate-500">{log.auditable_type ? `${log.auditable_type} #${log.auditable_id}` : '—'}</td>
                      <td className="font-mono text-[10px] text-slate-400">{log.ip_address || '—'}</td>
                      <td className="text-[11px] text-slate-500">{dateTime(log.created_at)}</td>
                      <td>
                        <button
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                          onClick={() => setExpanded((prev) => (prev === log.id ? null : log.id))}
                        >{expanded === log.id ? 'Hide' : 'Details'}</button>
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Previous values</p>
                              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-white p-2 text-[10px] text-slate-600 ring-1 ring-slate-200">{log.old_values ? JSON.stringify(log.old_values, null, 2) : '—'}</pre>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">New values</p>
                              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-white p-2 text-[10px] text-slate-600 ring-1 ring-slate-200">{log.new_values ? JSON.stringify(log.new_values, null, 2) : '—'}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} /></div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Entries are append-only. Sensitive values such as passwords are never recorded. Use the filters to investigate a specific action or staff account.
      </p>
    </div>
  )
}
