import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, EmptyState, ErrorState, Loading, PageHeader, StatCard } from '../../components/ui'

export default function SellerSettlementsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-settlements'],
    queryFn: async () => (await api.get('/seller/settlements')).data.settlements,
  })

  const rows = data?.data || []
  const totalNet = rows.filter((row: any) => row.status !== 'cancelled').reduce((sum: number, row: any) => sum + Number(row.net_payable), 0)
  const totalPaid = rows.filter((row: any) => row.status === 'paid').reduce((sum: number, row: any) => sum + Number(row.net_payable), 0)

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title="Settlements"
        subtitle="Payouts are prepared by the marketplace from delivered sales, less commission and refunds."
      />

      {isLoading ? <Loading label="Loading settlements…" /> : error ? (
        <ErrorState message="Settlements could not be loaded." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Settlements" value={rows.length} icon="₹" />
            <StatCard label="Lifetime net" value={money(totalNet)} tone="brand" icon="৳" />
            <StatCard label="Paid out" value={money(totalPaid)} tone="green" icon="✓" />
            <StatCard label="Awaiting payout" value={money(Math.max(0, totalNet - totalPaid))} tone="amber" icon="⏳" />
          </div>

          {!rows.length ? (
            <EmptyState
              title="No settlements yet"
              description="Once delivered orders are eligible, the administrator can prepare your first settlement for a date range."
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row: any) => (
                <div key={row.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{date(row.period_start)} – {date(row.period_end)}</p>
                      <p className="text-[10px] text-slate-400">Settlement #{row.id} {row.paid_at ? `· paid ${date(row.paid_at)}` : ''}</p>
                    </div>
                    <Badge tone={row.status === 'paid' ? 'green' : row.status === 'approved' ? 'blue' : 'amber'}>{row.status}</Badge>
                  </div>
                  <div className="grid gap-3 px-4 py-3 sm:grid-cols-4">
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Gross sales</p><p className="text-sm font-bold text-slate-800">{money(row.gross_sales)}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Commission</p><p className="text-sm font-bold text-rose-600">−{money(row.commission_total)}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Refunds</p><p className="text-sm font-bold text-rose-600">−{money(row.refund_total)}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Net payable</p><p className="text-sm font-bold text-emerald-700">{money(row.net_payable)}</p></div>
                  </div>
                  {!!row.payouts?.length && (
                    <div className="border-t border-slate-100 px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payouts</p>
                      {row.payouts.map((payout: any) => (
                        <div key={payout.id} className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-600">
                          <span className="capitalize">{payout.method.replace(/_/g, ' ')} · <span className="font-mono">{payout.reference}</span></span>
                          <span className="font-semibold">{money(payout.amount)} · {payout.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(data?.last_page || 1) > 1 && <p className="text-[11px] text-slate-400">Page {data.current_page} of {data.last_page}</p>}
            </div>
          )}

          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500">
            Settlement timing depends on the marketplace delivery and return windows. If you believe a payout is missing, open a support ticket with the settlement period and your store name.
          </p>
        </>
      )}
    </div>
  )
}
