import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, timeAgo } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui'

type Ticket = {
  id: number
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  messages_count: number
  customer?: { id: number; name: string; email: string } | null
  assignee?: string | null
  order_number?: string | null
  last_reply_at?: string | null
  created_at?: string
}

type TicketDetail = {
  id: number
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  customer?: { id: number; name: string; email: string } | null
  order_number?: string | null
  assignee?: string | null
  messages: { id: number; message: string; is_staff: boolean; author: string; created_at: string }[]
}

const priorityTone = (priority: string) => priority === 'urgent' ? 'red' : priority === 'high' ? 'amber' : priority === 'low' ? 'slate' : 'blue'
const statusTone = (status: string) => status === 'resolved' ? 'green' : status === 'closed' ? 'slate' : status === 'pending' ? 'blue' : 'amber'

export default function AdminSupportPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [reply, setReply] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-support', status, priority, term, page],
    queryFn: async () => (await api.get('/admin/support', { params: { status: status || undefined, priority: priority || undefined, search: term || undefined, page } })).data.tickets,
    placeholderData: keepPreviousData,
  })

  const { data: detail } = useQuery({
    queryKey: ['admin-ticket', detailId],
    queryFn: async () => (await api.get(`/admin/support/${detailId}`)).data.ticket as TicketDetail,
    enabled: !!detailId,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-support'] })
    queryClient.invalidateQueries({ queryKey: ['admin-ticket', detailId] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const sendReply = useMutation({
    mutationFn: async () => (await api.post(`/admin/support/${detailId}/reply`, { message: reply })).data,
    onSuccess: () => { refresh(); setReply(''); push('Reply sent to the customer.') },
    onError: (err) => push(apiError(err, 'The reply could not be sent.'), 'error'),
  })

  const update = useMutation({
    mutationFn: async (payload: { status?: string; priority?: string }) => (await api.patch(`/admin/support/${detailId}`, payload)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Ticket updated.') },
    onError: (err) => push(apiError(err, 'The ticket could not be updated.'), 'error'),
  })

  const rows: Ticket[] = data?.data || []

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Support"
        subtitle="Triage customer tickets, reply as staff, and update status or priority."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex min-w-[220px] flex-1 gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket number or subject" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        <select className="input max-w-[160px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input max-w-[160px]" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }}>
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {isLoading ? <Loading label="Loading tickets…" /> : error ? (
        <ErrorState message="Support tickets could not be loaded." onRetry={() => refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No support tickets" description="Customer tickets appear here. The queue is empty right now." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ticket</th><th>Customer</th><th>Category</th><th>Order</th><th>Messages</th><th>Priority</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {rows.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <button onClick={() => { setDetailId(ticket.id); setReply('') }} className="max-w-[220px] truncate text-left text-xs font-semibold text-brand-600 hover:underline">{ticket.subject}</button>
                      <p className="font-mono text-[10px] text-slate-400">{ticket.ticket_number}</p>
                    </td>
                    <td className="text-xs">
                      {ticket.customer?.name || '—'}
                      <p className="text-[10px] text-slate-400">{ticket.customer?.email}</p>
                    </td>
                    <td className="text-xs capitalize">{ticket.category}</td>
                    <td className="font-mono text-[10px] text-slate-500">{ticket.order_number || '—'}</td>
                    <td className="text-xs">{ticket.messages_count}</td>
                    <td><Badge tone={priorityTone(ticket.priority)}>{ticket.priority}</Badge></td>
                    <td><Badge tone={statusTone(ticket.status)}>{ticket.status}</Badge></td>
                    <td className="text-[10px] text-slate-500">{timeAgo(ticket.last_reply_at || ticket.created_at)}</td>
                    <td><button onClick={() => { setDetailId(ticket.id); setReply('') }} className="text-[11px] font-semibold text-brand-600 hover:underline">Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} /></div>
        </div>
      )}

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.subject || 'Support ticket'} wide>
        {!detail ? <Loading label="Loading ticket…" /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono font-bold text-slate-700">{detail.ticket_number}</span>
              <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
              <Badge tone={priorityTone(detail.priority)}>{detail.priority}</Badge>
              <span className="capitalize">{detail.category}</span>
              {detail.order_number && <span>Order <span className="font-mono">{detail.order_number}</span></span>}
            </div>
            <p className="text-xs text-slate-500">Customer: <span className="font-semibold text-slate-700">{detail.customer?.name}</span> · {detail.customer?.email}</p>

            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {detail.messages.map((message) => (
                <div key={message.id} className={`rounded-lg border px-3 py-2.5 ${message.is_staff ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-slate-700">
                      {message.author}
                      {message.is_staff && <span className="ml-1 rounded bg-brand-500 px-1 py-0.5 text-[9px] uppercase text-white">Staff</span>}
                    </p>
                    <span className="text-[10px] text-slate-400">{dateTime(message.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{message.message}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Set status">
                <select className="input" value={detail.status} onChange={(e) => update.mutate({ status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="pending">Pending customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Set priority">
                <select className="input" value={detail.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
            </div>

            <Field label="Staff reply" hint="The customer receives a notification with a link to this ticket.">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} placeholder="Write a clear reply with next steps." />
            </Field>
            <div className="flex justify-end">
              <Button size="sm" loading={sendReply.isPending} disabled={reply.trim().length < 2} onClick={() => sendReply.mutate()}>Send reply</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
