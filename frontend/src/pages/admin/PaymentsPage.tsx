import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import { Badge, Button, EmptyState, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Textarea, useToast } from '../../components/ui'

type PendingPayment = {
  id: number
  order_id: number
  order_number?: string
  customer?: string
  customer_phone?: string | null
  method_code?: string
  method_name?: string
  amount: string
  status: string
  reference?: string | null
  sender_number?: string | null
  submitted_at?: string | null
  order_status?: string
}

type PendingResponse = {
  payments: {
    data: PendingPayment[]
    current_page: number
    last_page: number
    total: number
  }
}

export default function AdminPaymentsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [verifyTarget, setVerifyTarget] = useState<PendingPayment | null>(null)
  const [reference, setReference] = useState('')
  const [rejectTarget, setRejectTarget] = useState<PendingPayment | null>(null)
  const [reason, setReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-payments', page, status, method],
    queryFn: async () => (await api.get('/admin/payments/pending', { params: { page, status: status || undefined, method: method || undefined } })).data as PendingResponse,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-payments'] })
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const verify = useMutation({
    mutationFn: async () => (await api.post(`/admin/payments/${verifyTarget?.id}/verify`, { reference: reference || undefined })).data,
    onSuccess: () => {
      refresh()
      setVerifyTarget(null)
      setReference('')
      push('Payment verified and the order marked as paid.')
    },
    onError: (err) => push(apiError(err, 'The payment could not be verified.'), 'error'),
  })

  const reject = useMutation({
    mutationFn: async () => (await api.post(`/admin/payments/${rejectTarget?.id}/reject`, { reason })).data,
    onSuccess: () => {
      refresh()
      setRejectTarget(null)
      setReason('')
      push('Payment reference rejected. The customer was notified.')
    },
    onError: (err) => push(apiError(err, 'The payment could not be rejected.'), 'error'),
  })

  const payments = data?.payments?.data || []

  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        title="Manual payment verification"
        subtitle="Mobile wallet, Bangla QR, and other manual payments appear here after the customer submits a transaction reference. Verify against your merchant statement before marking an order paid."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <Field label="Status" className="w-40">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            <option value="">All received</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Not yet submitted</option>
          </Select>
        </Field>
        <Field label="Method" className="w-44">
          <Select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1) }}>
            <option value="">All methods</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="rocket">Rocket</option>
            <option value="banglaqr">Bangla QR</option>
            <option value="online">Online gateway</option>
          </Select>
        </Field>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pending total</p>
          <p className="text-lg font-bold text-slate-900">{data?.payments?.total ?? 0}</p>
        </div>
      </div>

      {isLoading ? <Loading label="Loading pending payments…" /> : error ? (
        <EmptyState title="Payments could not be loaded" description={apiError(error)} />
      ) : payments.length === 0 ? (
        <EmptyState title="No pending manual payments" description="When a customer submits a bKash, Nagad, Rocket, or Bangla QR reference, it will appear here for verification." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Submitted</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link to={`/admin/orders/${payment.order_id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">
                        {payment.order_number}
                      </Link>
                      <p className="mt-0.5 text-[10px] capitalize text-slate-400">Order {payment.order_status?.replace(/_/g, ' ')}</p>
                    </td>
                    <td>
                      <p className="text-xs font-semibold text-slate-700">{payment.customer || '—'}</p>
                      <p className="text-[10px] text-slate-400">{payment.customer_phone || 'No phone'}</p>
                    </td>
                    <td>
                      <p className="text-xs font-semibold text-slate-700">{payment.method_name || payment.method_code}</p>
                      <Badge tone={payment.status === 'submitted' ? 'amber' : 'slate'} className="mt-1">{payment.status}</Badge>
                    </td>
                    <td className="font-semibold text-slate-800">{money(payment.amount)}</td>
                    <td>
                      <p className="font-mono text-xs text-slate-700">{payment.reference || '—'}</p>
                      {payment.sender_number && <p className="text-[10px] text-slate-400">From {payment.sender_number}</p>}
                    </td>
                    <td className="text-[11px] text-slate-500">{payment.submitted_at ? dateTime(payment.submitted_at) : 'Not submitted'}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="xs" variant="success" disabled={!payment.reference} onClick={() => { setVerifyTarget(payment); setReference(payment.reference || '') }}>Verify</Button>
                        <Button size="xs" variant="secondary" className="!text-rose-600" onClick={() => { setRejectTarget(payment); setReason('') }}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data?.payments?.current_page || 1} lastPage={data?.payments?.last_page || 1} total={data?.payments?.total} onChange={setPage} />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-relaxed text-amber-900">
        <p className="font-bold">Verification checklist</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Confirm the transaction ID and sender number in the bKash/Nagad/Rocket merchant statement.</li>
          <li>Confirm the amount matches the order total, including any payment fee.</li>
          <li>Never verify a payment you cannot see in the merchant statement. Reject with a clear reason so the customer can resubmit.</li>
          <li>Verification marks the order paid, notifies the customer, sends the payment SMS (if enabled), and fires the payment webhook.</li>
        </ul>
      </div>

      <Modal open={!!verifyTarget} onClose={() => setVerifyTarget(null)} title="Verify payment" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setVerifyTarget(null)}>Cancel</Button>
          <Button size="sm" variant="success" loading={verify.isPending} onClick={() => verify.mutate()}>Mark order paid</Button>
        </>
      }>
        {verifyTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p><span className="font-semibold text-slate-800">{verifyTarget.order_number}</span> · {verifyTarget.method_name || verifyTarget.method_code} · {money(verifyTarget.amount)}</p>
              <p className="mt-0.5">Customer reference: <span className="font-mono font-semibold">{verifyTarget.reference || '—'}</span></p>
            </div>
            <Field label="Verification reference" hint="Optional internal note, bank reference, or adjusted transaction ID.">
              <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} />
            </Field>
            <p className="rounded bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">This action is audited and cannot be undone from this screen.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject payment reference" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button size="sm" variant="danger" loading={reject.isPending} disabled={reason.trim().length < 4} onClick={() => reject.mutate()}>Reject reference</Button>
        </>
      }>
        <p className="text-xs text-slate-600">The order returns to unpaid and the customer is notified. They can submit a corrected reference from the order page.</p>
        <Field label="Reason" required hint="At least 4 characters. This is shown to the customer." className="mt-3">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Transaction ID not found in the merchant statement." />
        </Field>
      </Modal>
    </div>
  )
}
