import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, Textarea, cn, useToast } from '../../components/ui'

type ReturnRow = {
  id: number
  return_number: string
  status: string
  status_label: string
  status_tone?: string
  order_number?: string
  product_name?: string
  variant_name?: string
  quantity: number
  reason: string
  description?: string
  refund_amount: string
  customer?: string
  store?: string
  created_at?: string
}

type RefundRow = {
  id: number
  order_number?: string
  amount: string
  status: string
  method: string
  processed_at?: string
  note?: string
}

const statusTone = (status: string) => status === 'rejected' ? 'red' : ['refunded', 'completed'].includes(status) ? 'green' : status === 'received' ? 'blue' : 'amber'

export default function AdminReturnsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [tab, setTab] = useState<'returns' | 'refunds'>('returns')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<{ row: ReturnRow; status: string } | null>(null)
  const [note, setNote] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-returns', status, page],
    queryFn: async () => (await api.get('/admin/returns', { params: { status: status || undefined, page } })).data.returns,
    placeholderData: keepPreviousData,
    enabled: tab === 'returns',
  })

  const { data: refunds, isLoading: loadingRefunds, error: refundsError, refetch: refetchRefunds } = useQuery({
    queryKey: ['admin-refunds'],
    queryFn: async () => (await api.get('/admin/refunds')).data.refunds,
    enabled: tab === 'refunds',
  })

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/admin/returns/${action?.row.id}`, { status: action?.status, note: note || undefined })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-returns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-refunds'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setAction(null)
      setNote('')
      push(result.message || 'Return updated.')
    },
    onError: (err) => push(apiError(err, 'The return could not be updated.'), 'error'),
  })

  const rows: ReturnRow[] = data?.data || []
  const refundRows: RefundRow[] = refunds?.data || []

  const nextActions = (row: ReturnRow): string[] => {
    switch (row.status) {
      case 'approved': return ['received', 'rejected']
      case 'received': return ['refunded']
      case 'requested': return ['approved', 'rejected']
      default: return []
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Returns & refunds"
        subtitle="Coordinate return approvals, record received items, and process COD refunds. Sellers review requests first."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([['returns', 'Return requests'], ['refunds', 'Refund records']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', tab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}
          >{label}</button>
        ))}
        {tab === 'returns' && (
          <select className="input ml-auto max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All return statuses</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="received">Received</option>
            <option value="refunded">Refunded</option>
            <option value="completed">Completed</option>
          </select>
        )}
      </div>

      {tab === 'returns' ? (
        isLoading ? <Loading label="Loading returns…" /> : error ? (
          <ErrorState message="Returns could not be loaded." onRetry={() => refetch()} />
        ) : !rows.length ? (
          <EmptyState title="No return requests" description="Customer return requests appear here after delivery." />
        ) : (
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Return</th><th>Order</th><th>Customer</th><th>Store</th><th>Item</th><th>Qty</th><th>Refund</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <p className="font-mono text-xs font-semibold text-slate-800">{row.return_number}</p>
                        <p className="text-[10px] text-slate-400">{date(row.created_at)}</p>
                      </td>
                      <td className="font-mono text-[11px] text-slate-500">{row.order_number}</td>
                      <td className="text-xs">{row.customer || '—'}</td>
                      <td className="text-xs">{row.store || '—'}</td>
                      <td className="max-w-[170px]">
                        <p className="truncate text-xs font-semibold text-slate-700">{row.product_name}</p>
                        <p className="truncate text-[10px] text-slate-400">{row.variant_name} · {row.reason}</p>
                      </td>
                      <td className="text-xs">{row.quantity}</td>
                      <td className="text-xs font-semibold">{money(row.refund_amount)}</td>
                      <td><Badge tone={row.status_tone || statusTone(row.status)}>{row.status_label}</Badge></td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1">
                          {nextActions(row).map((next) => (
                            <button
                              key={next}
                              onClick={() => { setAction({ row, status: next }); setNote('') }}
                              className={cn(
                                'rounded-md px-2 py-1 text-[11px] font-semibold',
                                next === 'rejected' ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50',
                              )}
                            >
                              {next === 'received' ? 'Mark received' : next === 'refunded' ? 'Process refund' : next === 'approved' ? 'Approve' : 'Reject'}
                            </button>
                          ))}
                          {!nextActions(row).length && <span className="text-[10px] text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 pb-3"><Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} /></div>
          </div>
        )
      ) : loadingRefunds ? <Loading label="Loading refunds…" /> : refundsError ? (
        <ErrorState message="Refund records could not be loaded." onRetry={() => refetchRefunds()} />
      ) : !refundRows.length ? (
        <EmptyState title="No refunds recorded" description="Refunds appear here after a received return is processed." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Refund</th><th>Order</th><th>Amount</th><th>Method</th><th>Status</th><th>Processed</th><th>Note</th></tr></thead>
              <tbody>
                {refundRows.map((refund) => (
                  <tr key={refund.id}>
                    <td className="font-mono text-xs">#{refund.id}</td>
                    <td className="font-mono text-[11px] text-slate-500">{refund.order_number}</td>
                    <td className="text-xs font-semibold">{money(refund.amount)}</td>
                    <td className="text-xs capitalize">{refund.method?.replace(/_/g, ' ')}</td>
                    <td><Badge tone={refund.status === 'processed' ? 'green' : 'amber'}>{refund.status}</Badge></td>
                    <td className="text-[11px] text-slate-500">{refund.processed_at ? date(refund.processed_at) : '—'}</td>
                    <td className="max-w-[220px] truncate text-[11px] text-slate-500">{refund.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!action} onClose={() => setAction(null)} title={action ? actionLabel(action.status) : ''} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button size="sm" variant={action?.status === 'rejected' ? 'danger' : 'primary'} loading={update.isPending} disabled={action?.status === 'rejected' && note.trim().length < 5} onClick={() => update.mutate()}>
            {action?.status === 'rejected' ? 'Reject return' : action?.status === 'refunded' ? 'Record refund' : 'Save update'}
          </Button>
        </>
      }>
        {action && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{action.row.return_number} · {action.row.product_name}</p>
              <p className="text-slate-500">Customer: {action.row.customer} · Store: {action.row.store}</p>
              <p className="text-slate-500">Qty {action.row.quantity} · refund {money(action.row.refund_amount)} · reason: {action.row.reason}</p>
              {action.row.description && <p className="mt-1 text-[11px] text-slate-500">{action.row.description}</p>}
            </div>
            {action.status === 'refunded' && (
              <p className="rounded bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
                Marking the return refunded records the refund, restocks the item, and updates the customer. Because this deployment has no online gateway, complete the actual cash/bank transfer separately and note the reference below.
              </p>
            )}
            {action.status === 'received' && (
              <p className="rounded bg-blue-50 px-2.5 py-2 text-[10px] text-blue-800">Confirm the item physically arrived and matches the approved return before marking it received.</p>
            )}
            <Field label={action.status === 'rejected' ? 'Rejection reason' : 'Internal note'} required={action.status === 'rejected'} hint={action.status === 'rejected' ? 'Shared with the customer. At least 5 characters.' : 'Optional. Record inspection details or transfer reference.'}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

function actionLabel(status: string) {
  switch (status) {
    case 'approved': return 'Approve return request'
    case 'rejected': return 'Reject return request'
    case 'received': return 'Mark return received'
    case 'refunded': return 'Process refund'
    case 'completed': return 'Complete return'
    default: return 'Update return'
  }
}
