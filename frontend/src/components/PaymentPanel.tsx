import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { api, apiError } from '../lib/api'
import { money } from '../lib/format'
import type { Order } from '../lib/types'
import { Badge, Button, Field, Input, useToast } from './ui'

function CopyButton({ value }: { value: string }) {
  const { push } = useToast()
  return (
    <button
      type="button"
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          push('Copied to clipboard.')
        } catch {
          push('Copy failed. Please select and copy the number manually.', 'error')
        }
      }}
    >
      Copy
    </button>
  )
}

export function PaymentPanel({ order, onUpdated }: { order: Order; onUpdated?: () => void }) {
  const { push } = useToast()
  const payment = order.payment
  const [sender, setSender] = useState('')
  const [reference, setReference] = useState('')
  const paid = order.payment_status === 'paid'

  const submit = useMutation({
    mutationFn: async () => (await api.post(`/orders/${order.order_number}/payment/submit`, {
      sender_number: sender || undefined,
      transaction_id: reference,
    })).data,
    onSuccess: () => {
      setReference('')
      push('Payment reference submitted. We will verify it shortly.')
      onUpdated?.()
    },
    onError: (err) => push(apiError(err, 'The payment reference could not be submitted.'), 'error'),
  })

  const retry = useMutation({
    mutationFn: async () => (await api.post(`/orders/${order.order_number}/payment/retry`)).data,
    onSuccess: (data) => {
      const url = data?.payment?.redirect_url
      if (url) window.location.assign(url)
      else push('The gateway did not return a payment page. Please try another method or contact support.', 'error')
    },
    onError: (err) => push(apiError(err, 'The online payment gateway could not be started.'), 'error'),
  })

  if (!payment) return null

  const transaction = payment.transaction
  const awaiting = order.payment_status === 'awaiting_verification'
  const rejected = transaction?.status === 'failed'
  const config = payment.config || {}
  const merchantNumber = config.merchant_number || ''
  const merchantName = config.merchant_name || payment.name

  if (payment.type === 'cod') {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">Cash on Delivery</h3>
          <Badge tone={order.payment_status_tone}>{order.payment_status_label}</Badge>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
          {paid
            ? `Cash payment of ${money(order.grand_total)} has been recorded. Thank you.`
            : `Pay ${money(order.grand_total)} in cash to the delivery agent when your parcel arrives. Please keep the exact amount ready if possible.`}
        </p>
        {payment.instructions && <p className="mt-2 whitespace-pre-line text-[11px] text-amber-800">{payment.instructions}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment · {payment.name}</h3>
          <p className="mt-1 text-lg font-bold text-slate-900">{money(order.grand_total)}</p>
        </div>
        <Badge tone={order.payment_status_tone}>{order.payment_status_label}</Badge>
      </div>

      {paid ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          Payment confirmed{order.paid_at ? ` on ${new Date(order.paid_at).toLocaleString('en-GB')}` : ''}. Thank you.
        </p>
      ) : (
        <>
          {payment.qr_payload && (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-start">
              <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                <QRCodeSVG value={payment.qr_payload} size={148} level="M" />
              </div>
              <div className="text-center text-[11px] text-slate-600 sm:text-left">
                <p className="font-bold text-slate-800">Scan with your bank or MFS app</p>
                <p className="mt-1">Merchant: <span className="font-semibold">{String(config.qr_merchant_name || merchantName)}</span></p>
                <p>Amount: <span className="font-semibold">{money(order.grand_total)}</span></p>
                <p>Reference: <span className="font-mono font-semibold">{order.order_number}</span></p>
                <p className="mt-1 text-[10px] text-slate-400">Confirm the merchant name and amount before approving.</p>
              </div>
            </div>
          )}

          {merchantNumber && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold">{String(config.account_type || 'Merchant')} number:</span>
              <span className="font-mono font-bold text-brand-700">{merchantNumber}</span>
              <CopyButton value={merchantNumber} />
              <span className="text-[10px] text-slate-500">{merchantName}</span>
            </div>
          )}

          {config.biller_id && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold">bKash Pay Bill biller:</span>
              <span className="font-mono font-bold text-slate-900">{String(config.biller_id)}</span>
              <CopyButton value={String(config.biller_id)} />
              <span className="text-[10px] text-slate-500">{String(config.biller_name || merchantName)}</span>
            </div>
          )}

          {payment.instructions && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">{payment.instructions}</p>
          )}

          {payment.type === 'hosted' && (
            <div className="mt-3">
              {payment.redirect_url ? (
                <a href={payment.redirect_url} className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                  Continue to secure payment
                </a>
              ) : (
                <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate()}>
                  {order.payment_status === 'failed' ? 'Retry online payment' : 'Start online payment'}
                </Button>
              )}
            </div>
          )}

          {awaiting ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p className="font-bold">Reference submitted — awaiting verification</p>
              <p className="mt-0.5">
                We received your payment reference{transaction?.reference ? <> <span className="font-mono font-semibold">{transaction.reference}</span></> : null}. Our team verifies payments during business hours.
              </p>
            </div>
          ) : payment.requires_verification ? (
            <form
              className="mt-3 space-y-2.5"
              onSubmit={(event) => {
                event.preventDefault()
                if (reference.trim().length >= 4) submit.mutate()
              }}
            >
              {rejected && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  Your previous reference could not be verified. Please check the transaction details and submit again, or contact support.
                </p>
              )}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Sender number" hint="The number you paid from (optional).">
                  <Input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="01XXXXXXXXX" maxLength={20} />
                </Field>
                <Field label="Transaction ID / reference" required hint="At least 4 characters.">
                  <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. 9F2K1L0ABC" maxLength={100} />
                </Field>
              </div>
              <Button type="submit" size="sm" loading={submit.isPending} disabled={reference.trim().length < 4}>
                Submit payment reference
              </Button>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Only submit a reference after completing the transfer. False references delay verification and may lead to order cancellation.
              </p>
            </form>
          ) : null}
        </>
      )}
    </section>
  )
}
