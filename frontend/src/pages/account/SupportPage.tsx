import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, timeAgo } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, Textarea, useToast } from '../../components/ui'

type Ticket = {
  id: number
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  messages_count: number
  last_reply_at?: string
  created_at?: string
}

type TicketDetail = Ticket & {
  messages: { id: number; message: string; is_staff: boolean; author: string; created_at: string }[]
}

const categories = [
  ['order', 'Order issue'],
  ['payment', 'Payment / COD'],
  ['delivery', 'Delivery'],
  ['return', 'Return or refund'],
  ['account', 'Account'],
  ['product', 'Product question'],
  ['other', 'Other'],
]

const tone = (status: string) => status === 'resolved' || status === 'closed' ? 'green' : status === 'pending' ? 'blue' : 'amber'

export default function SupportPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [reply, setReply] = useState('')
  const [form, setForm] = useState({ subject: '', category: 'order', priority: 'normal', message: '' })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: async () => (await api.get('/support/tickets')).data.tickets,
  })

  const { data: detail } = useQuery({
    queryKey: ['support-ticket', detailId],
    queryFn: async () => (await api.get(`/support/tickets/${detailId}`)).data.ticket as TicketDetail,
    enabled: !!detailId,
  })

  const createTicket = useMutation({
    mutationFn: async () => (await api.post('/support/tickets', form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      setCreateOpen(false)
      setForm({ subject: '', category: 'order', priority: 'normal', message: '' })
      push('Support ticket created.')
    },
    onError: (err) => push(apiError(err, 'The ticket could not be created.'), 'error'),
  })

  const sendReply = useMutation({
    mutationFn: async () => (await api.post(`/support/tickets/${detailId}/reply`, { message: reply })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-ticket', detailId] })
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      setReply('')
      push('Reply sent.')
    },
    onError: (err) => push(apiError(err, 'Your reply could not be sent.'), 'error'),
  })

  const tickets: Ticket[] = data?.data || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Support tickets</h2>
          <p className="mt-0.5 text-xs text-slate-500">Open a ticket for order, delivery, return, or account help. Replies arrive in your notifications.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ New ticket</Button>
      </div>

      {isLoading ? <Loading label="Loading tickets…" /> : error ? (
        <ErrorState message="Support tickets could not be loaded." onRetry={() => refetch()} />
      ) : !tickets.length ? (
        <EmptyState
          title="No support tickets"
          description="If something is not right with an order or your account, open a ticket and our team will help."
          action={<Button size="sm" onClick={() => setCreateOpen(true)}>Open a support ticket</Button>}
        />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {tickets.map((ticket) => (
            <button key={ticket.id} onClick={() => setDetailId(ticket.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                  <span className="font-mono text-slate-500">{ticket.ticket_number}</span>
                  <span className="truncate">{ticket.subject}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{ticket.category} · {ticket.messages_count} message(s) · updated {timeAgo(ticket.last_reply_at || ticket.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{ticket.priority}</span>
                <Badge tone={tone(ticket.status)}>{ticket.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Open a support ticket" footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button size="sm" loading={createTicket.isPending} disabled={form.subject.length < 5 || form.message.length < 5} onClick={() => createTicket.mutate()}>Submit ticket</Button>
        </>
      }>
        <div className="space-y-3">
          <Field label="Subject" required>
            <Input value={form.subject} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} maxLength={160} placeholder="Short summary of the issue" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <select className="input" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          <Field label="Describe the issue" required hint="Include order numbers where relevant. Do not include passwords or payment card data.">
            <Textarea value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} maxLength={5000} />
          </Field>
        </div>
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.subject || 'Ticket'} wide>
        {!detail ? <Loading label="Loading ticket…" /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono font-bold text-slate-700">{detail.ticket_number}</span>
              <Badge tone={tone(detail.status)}>{detail.status}</Badge>
              <span className="capitalize">{detail.category}</span>
              <span>· {detail.priority} priority</span>
            </div>
            <div className="space-y-2">
              {detail.messages.map((message) => (
                <div key={message.id} className={`rounded-lg border px-3 py-2.5 ${message.is_staff ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-slate-700">{message.author} {message.is_staff && <span className="ml-1 rounded bg-brand-500 px-1 py-0.5 text-[9px] uppercase text-white">Staff</span>}</p>
                    <span className="text-[10px] text-slate-400">{dateTime(message.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{message.message}</p>
                </div>
              ))}
            </div>
            <div>
              <Field label="Reply">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} placeholder="Add more information or reply to support." />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button size="sm" loading={sendReply.isPending} disabled={reply.trim().length < 2} onClick={() => sendReply.mutate()}>Send reply</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
