import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui'

type Settlement = {
  id: number
  store: string | null
  store_id?: number
  period_start: string
  period_end: string
  gross_sales: string
  commission_total: string
  refund_total: string
  net_payable: string
  status: string
  orders_count: number
  paid_at?: string | null
}

type StoreOption = { id: number; name: string; status?: string }

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const tone = (status: string) => status === 'paid' ? 'green' : status === 'approved' ? 'blue' : 'amber'

export default function AdminSettlementsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ store_id: '', period_start: daysAgo(30), period_end: today() })
  const [payFor, setPayFor] = useState<Settlement | null>(null)
  const [payout, setPayout] = useState({ method: 'bank_transfer', reference: '', note: '' })
  const [error, setError] = useState('')

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['admin-settlements', status, page],
    queryFn: async () => (await api.get('/admin/settlements', { params: { status: status || undefined, page } })).data.settlements,
    placeholderData: keepPreviousData,
  })

  const { data: sellers } = useQuery({
    queryKey: ['admin-sellers', 'approved'],
    queryFn: async () => (await api.get('/admin/sellers', { params: { status: 'approved', per_page: 100 } })).data.sellers,
    staleTime: 60_000,
  })

  const stores: StoreOption[] = (sellers?.data || [])
    .map((seller: { store?: StoreOption | null }) => seller.store)
    .filter((store: StoreOption | null): store is StoreOption => !!store)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const create = useMutation({
    mutationFn: async () => (await api.post('/admin/settlements', {
      store_id: Number(form.store_id),
      period_start: form.period_start,
      period_end: form.period_end,
    })).data,
    onSuccess: (result) => {
      refresh()
      setCreateOpen(false)
      setError('')
      push(result.message || 'Settlement prepared.')
    },
    onError: (err) => setError(apiError(err, 'The settlement could not be prepared. Check the period and that delivered orders are unsettled.')),
  })

  const approve = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/settlements/${id}/approve`)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Settlement approved.') },
    onError: (err) => push(apiError(err, 'The settlement could not be approved.'), 'error'),
  })

  const pay = useMutation({
    mutationFn: async () => (await api.post(`/admin/settlements/${payFor?.id}/pay`, payout)).data,
    onSuccess: (result) => {
      refresh()
      setPayFor(null)
      setPayout({ method: 'bank_transfer', reference: '', note: '' })
      push(result.message || 'Settlement marked paid.')
    },
    onError: (err) => push(apiError(err, 'The payout could not be recorded.'), 'error'),
  })

  const rows: Settlement[] = data?.data || []
  const totals = rows.reduce((acc, row) => ({
    net: acc.net + (row.status !== 'cancelled' ? Number(row.net_payable) : 0),
    paid: acc.paid + (row.status === 'paid' ? Number(row.net_payable) : 0),
  }), { net: 0, paid: 0 })

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Settlements"
        subtitle="Prepare seller payouts from delivered orders, approve them, and record the payout reference."
        actions={<Button size="sm" onClick={() => { setError(''); setCreateOpen(true) }}>+ Prepare settlement</Button>}
      />

      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
        <select className="input max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="pending">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
        </select>
        <p className="text-[11px] text-slate-500">On this page: <span className="font-semibold text-slate-700">{money(totals.net)}</span> net · <span className="font-semibold text-emerald-700">{money(totals.paid)}</span> paid</p>
      </div>

      {isLoading ? <Loading label="Loading settlements…" /> : loadError ? (
        <ErrorState message="Settlements could not be loaded." onRetry={() => refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title="No settlements yet"
          description="Prepare a settlement for a store once it has delivered, unsettled orders in your chosen period."
          action={<Button size="sm" onClick={() => { setError(''); setCreateOpen(true) }}>Prepare the first settlement</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Settlement</th><th>Store</th><th>Period</th><th>Orders</th><th>Gross</th><th>Commission</th><th>Refunds</th><th>Net payable</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">#{row.id}</td>
                    <td className="text-xs font-semibold text-slate-700">{row.store || '—'}</td>
                    <td className="text-[11px] text-slate-500">{date(row.period_start)}<br />{date(row.period_end)}</td>
                    <td className="text-xs">{row.orders_count}</td>
                    <td className="text-xs">{money(row.gross_sales)}</td>
                    <td className="text-xs text-rose-600">−{money(row.commission_total)}</td>
                    <td className="text-xs text-rose-600">−{money(row.refund_total)}</td>
                    <td className="text-xs font-bold text-emerald-700">{money(row.net_payable)}</td>
                    <td>
                      <Badge tone={tone(row.status)}>{row.status}</Badge>
                      {row.paid_at && <p className="mt-0.5 text-[10px] text-slate-400">{date(row.paid_at)}</p>}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        {row.status === 'pending' && <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50" onClick={() => approve.mutate(row.id)}>Approve</button>}
                        {row.status !== 'paid' && (
                          <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayFor(row); setPayout({ method: 'bank_transfer', reference: '', note: '' }) }}>Record payout</button>
                        )}
                        {row.status === 'paid' && <span className="text-[10px] text-slate-400">Completed</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} /></div>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Prepare settlement" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.store_id} onClick={() => create.mutate()}>Prepare settlement</Button>
        </>
      }>
        <div className="space-y-3">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <Field label="Store" required hint="Only stores with unsettled delivered orders in the period can be settled.">
            <select className="input" value={form.store_id} onChange={(e) => setForm((prev) => ({ ...prev, store_id: e.target.value }))}>
              <option value="">Select a store</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period start" required>
              <Input type="date" value={form.period_start} max={form.period_end} onChange={(e) => setForm((prev) => ({ ...prev, period_start: e.target.value }))} />
            </Field>
            <Field label="Period end" required>
              <Input type="date" value={form.period_end} min={form.period_start} onChange={(e) => setForm((prev) => ({ ...prev, period_end: e.target.value }))} />
            </Field>
          </div>
          <p className="rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
            The settlement includes delivered or completed seller orders updated within the period that are not yet in a settlement. Gross is item subtotal after discounts, less commission and processed refunds.
          </p>
        </div>
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Record seller payout" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
          <Button size="sm" loading={pay.isPending} disabled={!payout.reference} onClick={() => pay.mutate()}>Mark paid</Button>
        </>
      }>
        {payFor && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{payFor.store} · settlement #{payFor.id}</p>
              <p className="text-slate-500">{date(payFor.period_start)} – {date(payFor.period_end)}</p>
              <p className="mt-1 text-base font-bold text-emerald-700">{money(payFor.net_payable)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payout method" required>
                <select className="input" value={payout.method} onChange={(e) => setPayout((prev) => ({ ...prev, method: e.target.value }))}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Reference" required hint="Bank trx ID, bKash TrxID, or voucher number.">
                <Input value={payout.reference} onChange={(e) => setPayout((prev) => ({ ...prev, reference: e.target.value }))} maxLength={120} />
              </Field>
            </div>
            <Field label="Internal note">
              <Textarea value={payout.note} onChange={(e) => setPayout((prev) => ({ ...prev, note: e.target.value }))} maxLength={1000} />
            </Field>
            <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
              Only record the payout after the transfer has actually been made. This marks the settlement paid, notifies the seller, and is written to the audit log.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
