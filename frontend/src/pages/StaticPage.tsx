import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

type Settings = Record<string, string | boolean | null>

const content: Record<string, { eyebrow: string; title: string; intro: string }> = {
  support: {
    eyebrow: 'Help center',
    title: 'How can we help?',
    intro: 'Find answers about orders, delivery, returns, payments, and your account. If you still need help, open a support ticket and our team will respond.',
  },
  about: {
    eyebrow: 'About us',
    title: 'A marketplace built for Bangladesh',
    intro: 'Marketplace connects customers with verified local sellers. We focus on transparent pricing, accountable fulfilment, and flexible payments including Cash on Delivery, mobile wallets, and Bangla QR.',
  },
  returns: {
    eyebrow: 'Policies',
    title: 'Returns & refunds',
    intro: 'We want you to receive exactly what you ordered. If something is wrong, you can request a return within the eligible window.',
  },
}

export default function StaticPage({ page }: { page: 'support' | 'about' | 'returns' }) {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => (await api.get('/settings/public')).data.settings as Settings,
    staleTime: 10 * 60 * 1000,
  })

  const meta = content[page]
  const storeName = String(data?.store_name || 'Marketplace')
  const intro = page === 'about'
    ? `${storeName} connects customers with verified local sellers. We focus on transparent pricing, accountable fulfilment, and flexible payments including Cash on Delivery, mobile wallets, and Bangla QR.`
    : meta.intro

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">{meta.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{meta.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{intro}</p>

        {page === 'support' && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-4">
                <h2 className="text-sm font-bold text-slate-900">Contact the marketplace</h2>
                <p className="mt-2 text-xs text-slate-500">Support hours: {String(data?.support_hours || 'Saturday–Thursday, 9:00–18:00')}</p>
                <p className="mt-1 text-xs text-slate-500">Phone: <span className="font-semibold text-slate-700">{String(data?.support_phone || 'Not published')}</span></p>
                <p className="mt-1 text-xs text-slate-500">Email: <span className="font-semibold text-slate-700">{String(data?.support_email || 'Not published')}</span></p>
                <Link to={user ? '/account/support' : '/login?next=%2Faccount%2Fsupport'} className="mt-3 inline-flex rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
                  {user ? 'Open a support ticket' : 'Sign in to open a ticket'}
                </Link>
              </div>
              <div className="card p-4">
                <h2 className="text-sm font-bold text-slate-900">Track or manage an order</h2>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  <li><Link to="/account/orders" className="link">View my orders and tracking</Link></li>
                  <li><Link to="/account/addresses" className="link">Manage delivery addresses</Link></li>
                  <li><Link to="/returns-policy" className="link">Read the return policy</Link></li>
                </ul>
              </div>
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Frequently asked questions</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {[
                  ['How do I pay?', 'Choose Cash on Delivery, bKash, Nagad, Rocket, Bangla QR, or an online card/bank gateway at checkout. Manual wallet and QR payments are verified by our team before the order is marked paid.'],
                  ['Do you charge a payment fee?', 'Some payment methods add a small fee, which is shown clearly at checkout before you place the order. Cash on Delivery has no extra fee.'],
                  ['How long does delivery take?', 'Delivery estimates depend on your district and are shown at checkout. Sellers may ship items separately in one order.'],
                  ['Can I cancel an order?', 'You can cancel from the order detail page while the order has not shipped. After shipping, contact support.'],
                  ['How do returns work?', 'Submit a return request from a delivered order. The seller reviews it, then the platform coordinates receipt and refund.'],
                  ['How do I become a seller?', `Use the “Sell on ${storeName}” link and submit an application. An administrator reviews it before activation.`],
                ].map(([question, answer]) => (
                  <details key={question} className="group py-2.5">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 group-open:text-brand-600">{question}</summary>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 'about' && (
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-600">
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">What we do</h2>
              <p className="mt-2">{storeName} is a multi-vendor platform where approved sellers list products and customers shop across categories including electronics, fashion, home, beauty, groceries, and sports. Every seller is reviewed before their store is activated.</p>
              <p className="mt-2">Orders are split by seller so each store can manage its own stock, shipments, and returns. The platform handles commissions, COD collection records, and settlements.</p>
            </div>
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">How we operate</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>Cash on Delivery, bKash, Nagad, Rocket, and Bangla QR nationwide, with district-based delivery fees.</li>
                <li>Stock is reserved when an order is placed and committed when it ships.</li>
                <li>Seller payouts are based on delivered sales minus commission and refunds.</li>
                <li>Returns are tracked with a clear status workflow.</li>
                <li>Administrative actions are recorded in an audit log.</li>
              </ul>
            </div>
          </div>
        )}

        {page === 'returns' && (
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-600">
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Return window</h2>
              <p className="mt-2">Eligible items may be returned within <strong>7 days of delivery</strong>. The request must be submitted from the delivered order in your account. Items must be unused, in their original packaging, and include all accessories.</p>
              <p className="mt-2">Perishable goods, innerwear, personal-care items that have been opened, and products marked non-returnable on the listing are excluded.</p>
            </div>
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">How to request a return</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>Open <Link to="/account/orders" className="link">My orders</Link> and select the delivered order.</li>
                <li>Choose the item and select <em>Request return</em>.</li>
                <li>Provide a reason and a short description. Submit the request.</li>
                <li>The seller reviews the request. If approved, the item is collected and inspected.</li>
                <li>After the item is received, the platform processes the refund and updates the order.</li>
              </ol>
            </div>
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Refunds</h2>
              <p className="mt-2">Cash and manual mobile-wallet payments are refunded through a recorded refund after the return is received and approved. Refunds are handled as an administrative process and documented in the order history. Hosted card/bank payments remain disabled until a gateway account is configured and verified.</p>
              <p className="mt-2">If your parcel arrives damaged, refuse delivery where possible and open a support ticket with photos and the order number.</p>
            </div>
            <div className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Need help?</h2>
              <p className="mt-2">Visit the <Link to="/support" className="link">help center</Link> or open a support ticket from your account.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
