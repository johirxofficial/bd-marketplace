import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, Stars, Textarea, useToast } from '../../components/ui'

type Review = {
  id: number
  rating: number
  title?: string | null
  comment: string
  status: string
  product?: { id: number; name: string; slug: string } | null
  customer?: { id: number; name: string; email: string } | null
  created_at?: string
}

export default function AdminReviewsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [rating, setRating] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<{ review: Review; status: 'approved' | 'rejected' } | null>(null)
  const [reply, setReply] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-reviews', status, rating, page],
    queryFn: async () => (await api.get('/admin/reviews', { params: { status: status || undefined, rating: rating || undefined, page } })).data.reviews,
    placeholderData: keepPreviousData,
  })

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/admin/reviews/${action?.review.id}`, {
      status: action?.status,
      seller_reply: reply || undefined,
    })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })
      setAction(null)
      setReply('')
      push(result.message || 'Review updated.')
    },
    onError: (err) => push(apiError(err, 'The review could not be updated.'), 'error'),
  })

  const rows: Review[] = data?.data || []

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Reviews"
        subtitle="Moderate customer reviews. Approved reviews update product ratings immediately."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <select className="input max-w-[170px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="input max-w-[150px]" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1) }}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{star} star</option>)}
        </select>
      </div>

      {isLoading ? <Loading label="Loading reviews…" /> : error ? (
        <ErrorState message="Reviews could not be loaded." onRetry={() => refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No reviews matched" description="Customer reviews appear here after a delivered order." />
      ) : (
        <div className="space-y-3">
          {rows.map((review) => (
            <div key={review.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <Badge tone={review.status === 'approved' ? 'green' : review.status === 'rejected' ? 'red' : 'amber'}>{review.status}</Badge>
                    <span className="text-[10px] text-slate-400">{date(review.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-800">{review.product?.name || 'Deleted product'}</p>
                  <p className="text-[10px] text-slate-400">{review.customer?.name} · {review.customer?.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {review.status !== 'approved' && <Button size="xs" onClick={() => { setAction({ review, status: 'approved' }); setReply('') }}>Approve</Button>}
                  {review.status !== 'rejected' && <Button size="xs" variant="secondary" onClick={() => { setAction({ review, status: 'rejected' }); setReply('') }}>Reject</Button>}
                </div>
              </div>
              {review.title && <p className="mt-2 text-sm font-semibold text-slate-800">{review.title}</p>}
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{review.comment}</p>
            </div>
          ))}
          <Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} />
        </div>
      )}

      <Modal open={!!action} onClose={() => setAction(null)} title={action?.status === 'approved' ? 'Approve review' : 'Reject review'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button size="sm" variant={action?.status === 'rejected' ? 'danger' : 'primary'} loading={update.isPending} onClick={() => update.mutate()}>
            {action?.status === 'approved' ? 'Approve review' : 'Reject review'}
          </Button>
        </>
      }>
        {action && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <Stars rating={action.review.rating} />
              <p className="mt-1 font-semibold text-slate-800">{action.review.product?.name}</p>
              <p className="mt-0.5 text-slate-600">{action.review.comment}</p>
            </div>
            <Field label="Official reply" hint="Optional. Displayed publicly as the seller/marketplace response.">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} />
            </Field>
            <p className="rounded bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">
              The customer is notified of the moderation decision. Rejected reviews do not count toward the product rating.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
