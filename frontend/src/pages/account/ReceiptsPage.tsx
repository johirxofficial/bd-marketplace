import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import { Badge, EmptyState, ErrorState, Loading, Pagination } from '../../components/ui'

type CustomerReceipt = {
  number: string
  type: string
  type_label: string
  amount: string
  currency: string
  issued_at?: string | null
  order_number?: string | null
  url: string
}

type ReceiptPageResponse = {
  data: CustomerReceipt[]
  current_page?: number
  last_page?: number
  total?: number
}

const tone: Record<string, string> = { order: 'blue', payment: 'green', refund: 'amber' }

export default function ReceiptsPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['receipts', page],
    queryFn: async () => (await api.get('/receipts', { params: { page } })).data.receipts as ReceiptPageResponse,
    placeholderData: keepPreviousData,
  })

  const receipts = data?.data || []

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Receipts</h2>
        <p className="mt-0.5 text-xs text-slate-500">Download or print receipts for orders, confirmed payments, and refunds.</p>
      </div>

      {isLoading ? <Loading label="Loading receipts…" /> : error ? (
        <ErrorState message="Your receipts could not be loaded." onRetry={() => refetch()} />
      ) : !receipts.length ? (
        <EmptyState
          title="No receipts yet"
          description="A receipt is issued automatically when you place an order and when a payment or refund is recorded."
          action={<Link to="/account/orders" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">View orders</Link>}
        />
      ) : (
        <div className="space-y-2">
          {receipts.map((receipt) => (
            <div key={receipt.number} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-800">{receipt.number}</span>
                  <Badge tone={tone[receipt.type] || 'slate'}>{receipt.type_label}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {receipt.order_number ? <>Order <span className="font-mono">{receipt.order_number}</span> · </> : null}
                  Issued {dateTime(receipt.issued_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-slate-900">{money(receipt.amount)}</p>
                <a href={receipt.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                  View / print
                </a>
              </div>
            </div>
          ))}
          <Pagination page={data?.current_page || 1} lastPage={data?.last_page || 1} total={data?.total} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
