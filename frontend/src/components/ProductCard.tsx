import { Link } from 'react-router-dom'
import { price } from '../lib/format'
import type { Product } from '../lib/types'
import { Stars } from './ui'

export function ProductCard({ product }: { product: Product }) {
  const discount = Number(product.discount_percent || 0)
  const effective = product.effective_price || product.price
  const compare = product.compare_at_price
  const sold = Number(product.sold_count || 0)
  const stock = Number(product.stock || 0)

  return (
    <Link to={`/products/${product.slug}`} className="dz-card group">
      <div className="relative aspect-square overflow-hidden bg-white">
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        />
        {discount > 0 && <span className="dz-discount">-{discount}%</span>}
        {stock <= 0 && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-[11px] font-semibold text-white">Out of stock</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[12.5px] font-medium leading-snug text-slate-700 group-hover:text-brand-600">
          {product.name}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
          <span className="text-[15px] font-bold leading-none text-brand-600">{price(effective)}</span>
          {compare && Number(compare) > Number(effective) && (
            <span className="text-[11px] text-slate-400 line-through">{price(compare)}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <Stars rating={product.rating_avg} />
          <span className="text-[10px] text-slate-400">({product.rating_count || 0})</span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-[10px] text-slate-400">
          <span className="truncate">{sold > 0 ? `${sold} sold` : 'Just added'}</span>
          <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-600">COD</span>
        </div>
      </div>
    </Link>
  )
}
