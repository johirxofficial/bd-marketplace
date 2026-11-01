import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="container-page flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[80px] font-extrabold leading-none text-brand-500">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">This page could not be found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">The link may be outdated, the product may have been removed, or the address may be incorrect.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Back to home</Link>
        <Link to="/products" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse products</Link>
        <Link to="/support" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Get help</Link>
      </div>
    </div>
  )
}
