import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { Button, EmptyState, ErrorState, Loading, useToast } from '../../components/ui'

type Notification = {
  id: number
  type: string
  title: string
  message: string
  action_url?: string | null
  read_at?: string | null
  created_at?: string
}

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: async () => (await api.get('/notifications')).data,
  })

  const markRead = useMutation({
    mutationFn: async (id: number) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      push('All notifications marked as read.')
    },
    onError: (err) => push(apiError(err, 'Could not mark notifications as read.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading notifications…" />
  if (error) return <ErrorState message="Notifications could not be loaded." onRetry={() => refetch()} />

  const items: Notification[] = data?.notifications?.data || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Notifications</h2>
          <p className="mt-0.5 text-xs text-slate-500">{data?.unread_count || 0} unread · order updates, seller decisions, and support replies appear here.</p>
        </div>
        {!!data?.unread_count && <Button size="sm" variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>Mark all as read</Button>}
      </div>

      {!items.length ? (
        <EmptyState title="No notifications" description="We will notify you about order status changes, returns, and support replies." />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className={`flex gap-3 px-4 py-3 ${item.read_at ? 'bg-white' : 'bg-brand-50/30'}`}>
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-slate-200' : 'bg-brand-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.message}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                  <span>{timeAgo(item.created_at)}</span>
                  <span className="capitalize">{item.type.replace(/[._]/g, ' ')}</span>
                  {item.action_url && <Link to={item.action_url} className="font-semibold text-brand-600 hover:underline" onClick={() => !item.read_at && markRead.mutate(item.id)}>Open →</Link>}
                  {!item.read_at && <button className="font-semibold text-slate-500 hover:text-slate-700" onClick={() => markRead.mutate(item.id)}>Mark read</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
