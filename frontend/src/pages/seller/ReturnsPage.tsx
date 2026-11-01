import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Textarea, useToast } from '../../components/ui'

type ReturnRow = {
  id: number
  return_number: string
  status: string
  status_label: string
  reason: string
  quantity: number
  refund_amount: string
  order_number?: string
  product_name?: string
  variant_name?: string
  customer?: string
  created_at?: string
}

export default function SellerReturnsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [action, setAction] = useState<{ row: ReturnRow; decision: 'approved' | 'rejected' } | null>(null)
  const [note, setNote] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-returns', status],
    queryFn: async () => (await api.get('/seller/returns', { params: { status: status || undefined } })).data.returns,
  })

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/seller/returns/${action?.row.id}`, { status: action?.decision, note: note || undefined })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seller-returns'] })
      queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] })
      setAction(null)
      setNote('')
      push(data.message || 'Return updated.')
    },
    onError: (err) => push(apiError(err, 'The return could not be updated.'), 'error'),
  })

  const rows: ReturnRow[] = data?.data || []

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title="Returns"
        subtitle="Review customer return requests. Approval starts the collection process; platform staff record receipt and refunds."
        actions={
          <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All return statuses</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="received">Received</option>
            <option value="refunded">Refunded</option>
          </select>
        }
      />

      {isLoading ? <Loading label="Loading returns…" /> : error ? (
        <ErrorState message="Returns could not be loaded." onRetry={() => refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No return requests" description="When a customer requests a return for one of your delivered items, it appears here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Return</th><th>Order</th><th>Item</th><th>Customer</th><th>Qty</th><th>Refund</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <p className="font-mono text-xs font-semibold text-slate-800">{row.return_number}</p>
                      <p className="max-w-[170px] truncate text-[10px] text-slate-400" title={row.reason}>{row.reason}</p>
                    </td>
                    <td className="font-mono text-[11px] text-slate-500">{row.order_number}</td>
                    <td className="max-w-[190px] text-xs">
                      <p className="truncate font-semibold text-slate-700">{row.product_name}</p>
                      <p className="truncate text-[10px] text-slate-400">{row.variant_name}</p>
                    </td>
                    <td className="text-xs">{row.customer || '—'}</td>
                    <td className="text-xs">{row.quantity}</td>
                    <td className="text-xs font-semibold">{money(row.refund_amount)}</td>
                    <td><Badge tone={row.status === 'rejected' ? 'red' : row.status === 'refunded' ? 'green' : 'amber'}>{row.status_label}</Badge><p className="mt-0.5 text-[10px] text-slate-400">{date(row.created_at)}</p></td>
                    <td>
                      {row.status === 'requested' ? (
                        <div className="flex justify-end gap-1">
                          <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => { setAction({ row, decision: 'approved' }); setNote('') }}>Approve</button>
                          <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50" onClick={() => { setAction({ row, decision: 'rejected' }); setNote('') }}>Reject</button>
                        </div>
                      ) : <span className="block text-right text-[10px] text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data?.last_page || 1) > 1 && <p className="px-4 py-2 text-[11px] text-slate-400">Showing page {data.current_page} of {data.last_page}</p>}
        </div>
      )}

      <Modal open={!!action} onClose={() => setAction(null)} title={action?.decision === 'approved' ? 'Approve return request' : 'Reject return request'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button size="sm" variant={action?.decision === 'approved' ? 'success' : 'danger'} loading={update.isPending} onClick={() => update.mutate()}>
            {action?.decision === 'approved' ? 'Approve return' : 'Reject return'}
          </Button>
        </>
      }>
        {action && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{action.row.return_number} · {action.row.product_name}</p>
              <p className="text-slate-500">Qty {action.row.quantity} · refund {money(action.row.refund_amount)} · reason: {action.row.reason}</p>
            </div>
            <Field label="Note to the platform team" hint="Explain your decision. This is recorded in the return history.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
            <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
              Approving a return does not move money. The marketplace receives and inspects the item, then records the refund. Rejected returns remain visible in the customer's order.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
