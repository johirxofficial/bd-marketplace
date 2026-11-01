import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui'

type Seller = {
  id: number
  business_name: string
  business_type: string
  phone?: string
  status: string
  commission_rate: string
  rejection_reason?: string | null
  user?: { id: number; name: string; email: string; phone?: string; status?: string }
  store?: { id: number; name: string; slug: string; status: string } | null
  created_at?: string
  approved_at?: string
}

type Dialog =
  | { kind: 'approve'; seller: Seller }
  | { kind: 'reject'; seller: Seller }
  | { kind: 'suspend'; seller: Seller }
  | { kind: 'commission'; seller: Seller }
  | null

const tone = (status: string) => status === 'approved' ? 'green' : status === 'pending' ? 'amber' : status === 'suspended' ? 'red' : 'slate'

export default function AdminSellersPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [commission, setCommission] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-sellers', status, term, page],
    queryFn: async () => (await api.get('/admin/sellers', { params: { status: status || undefined, search: term || undefined, page } })).data.sellers,
    placeholderData: keepPreviousData,
  })

  const sellers: Seller[] = data?.data || []
  const meta = data?.meta || {}

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const approve = useMutation({
    mutationFn: async () => (await api.post(`/admin/sellers/${dialog?.seller.id}/approve`, {
      commission_rate: commission ? Number(commission) : undefined,
    })).data,
    onSuccess: (result) => { refresh(); setDialog(null); push(result.message || 'Seller approved.') },
    onError: (err) => push(apiError(err, 'The seller could not be approved.'), 'error'),
  })

  const reject = useMutation({
    mutationFn: async () => (await api.post(`/admin/sellers/${dialog?.seller.id}/reject`, { reason })).data,
    onSuccess: (result) => { refresh(); setDialog(null); setReason(''); push(result.message || 'Application rejected.') },
    onError: (err) => push(apiError(err, 'The application could not be rejected.'), 'error'),
  })

  const suspend = useMutation({
    mutationFn: async () => (await api.post(`/admin/sellers/${dialog?.seller.id}/suspend`, { reason })).data,
    onSuccess: (result) => { refresh(); setDialog(null); setReason(''); push(result.message || 'Seller suspended.') },
    onError: (err) => push(apiError(err, 'The seller could not be suspended.'), 'error'),
  })

  const updateCommission = useMutation({
    mutationFn: async () => (await api.patch(`/admin/sellers/${dialog?.seller.id}/commission`, { commission_rate: Number(commission) })).data,
    onSuccess: (result) => { refresh(); setDialog(null); push(result.message || 'Commission updated.') },
    onError: (err) => push(apiError(err, 'Commission could not be updated.'), 'error'),
  })

  function open(next: Dialog) {
    setDialog(next)
    setReason('')
    setCommission(next?.seller.commission_rate ? String(Number(next.seller.commission_rate)) : '10')
  }

  const pending = sellers.filter((seller) => seller.status === 'pending').length

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Sellers"
        subtitle="Review applications, set commission, and manage store status. Approved sellers can publish products."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex min-w-[220px] flex-1 gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Business name or seller email" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        <select className="input max-w-[170px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        {pending > 0 && <Badge tone="amber">{pending} pending on this page</Badge>}
      </div>

      {isLoading ? <Loading label="Loading sellers…" /> : error ? (
        <ErrorState message="Sellers could not be loaded." onRetry={() => refetch()} />
      ) : !sellers.length ? (
        <EmptyState title="No sellers matched" description="Adjust the filters or search term." />
      ) : (
        <div className="space-y-3">
          {sellers.map((seller) => (
            <div key={seller.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">{seller.business_name}</h2>
                    <Badge tone={tone(seller.status)}>{seller.status}</Badge>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{seller.business_type?.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {seller.user?.name} · {seller.user?.email} · {seller.phone || seller.user?.phone || 'No phone'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {seller.status === 'pending' && (
                    <>
                      <Button size="xs" onClick={() => open({ kind: 'approve', seller })}>Approve</Button>
                      <Button size="xs" variant="secondary" onClick={() => open({ kind: 'reject', seller })}>Reject</Button>
                    </>
                  )}
                  {seller.status === 'approved' && (
                    <Button size="xs" variant="danger" onClick={() => open({ kind: 'suspend', seller })}>Suspend</Button>
                  )}
                  {(seller.status === 'approved' || seller.status === 'suspended') && (
                    <Button size="xs" variant="secondary" onClick={() => open({ kind: 'commission', seller })}>Commission</Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Store</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{seller.store?.name || 'Not created'}</p>
                  <p className="text-[10px] text-slate-400">{seller.store?.slug || '—'} · {seller.store?.status || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Commission</p>
                  <p className="mt-0.5 text-base font-bold text-slate-800">{Number(seller.commission_rate).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Applied</p>
                  <p className="mt-0.5 text-slate-600">{date(seller.created_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Approved</p>
                  <p className="mt-0.5 text-slate-600">{seller.approved_at ? date(seller.approved_at) : '—'}</p>
                </div>
              </div>

              {seller.rejection_reason && seller.status !== 'approved' && (
                <p className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  <span className="font-bold">Status reason: </span>{seller.rejection_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!!sellers.length && <Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} />}

      <Modal open={dialog?.kind === 'approve'} onClose={() => setDialog(null)} title="Approve seller application" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>Approve & activate store</Button>
        </>
      }>
        {dialog && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{dialog.seller.business_name}</p>
              <p className="text-slate-500">Store: {dialog.seller.store?.name || '—'} · {dialog.seller.user?.email}</p>
            </div>
            <Field label="Commission rate (%)" required hint="Between 0 and 50. Applied to future sales.">
              <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} />
            </Field>
            <p className="rounded bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
              Approving switches the store to active and grants the account the seller role. The seller receives a notification.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={dialog?.kind === 'reject'} onClose={() => setDialog(null)} title="Reject seller application" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" variant="danger" loading={reject.isPending} disabled={reason.trim().length < 5} onClick={() => reject.mutate()}>Reject application</Button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">The rejection reason is sent to the applicant. They can contact support if they believe this was a mistake.</p>
          <Field label="Reason" required hint="At least 5 characters.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Business address could not be verified." />
          </Field>
        </div>
      </Modal>

      <Modal open={dialog?.kind === 'suspend'} onClose={() => setDialog(null)} title="Suspend seller store" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" variant="danger" loading={suspend.isPending} disabled={reason.trim().length < 5} onClick={() => suspend.mutate()}>Suspend seller</Button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">Suspending the store hides its listings from the storefront. The seller, its products, and historical orders are preserved.</p>
          <Field label="Suspension reason" required hint="Shared with the seller. At least 5 characters.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
        </div>
      </Modal>

      <Modal open={dialog?.kind === 'commission'} onClose={() => setDialog(null)} title="Update commission rate" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" loading={updateCommission.isPending} disabled={!commission || Number(commission) < 0 || Number(commission) > 50} onClick={() => updateCommission.mutate()}>Save rate</Button>
        </>
      }>
        {dialog && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{dialog.seller.business_name}</p>
              <p className="text-slate-500">Current rate {Number(dialog.seller.commission_rate).toFixed(1)}%</p>
            </div>
            <Field label="New commission rate (%)" required hint="0–50. Existing orders keep their original rate.">
              <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
