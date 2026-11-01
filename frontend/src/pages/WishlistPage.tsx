import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import type { Product } from '../lib/types'
import { ProductCard } from '../components/ProductCard'
import { Button, EmptyState, ErrorState, Loading, useToast } from '../components/ui'

export default function WishlistPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => (await api.get('/wishlist')).data.items as { id: number; product: Product }[],
  })

  const remove = useMutation({
    mutationFn: async (productId: number) => (await api.delete(`/wishlist/${productId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      push('Removed from wishlist.')
    },
    onError: (err) => push(apiError(err, 'Could not remove this item.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading your wishlist…" />
  if (error) return <div className="container-page py-8"><ErrorState message="Your wishlist could not be loaded." onRetry={() => refetch()} /></div>

  return (
    <div className="container-page py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Wishlist</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.length || 0} saved product{data?.length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/products" className="text-xs font-semibold text-brand-600 hover:underline">Browse products →</Link>
      </div>

      {!data?.length ? (
        <EmptyState
          title="No saved products yet"
          description="Tap the wishlist button on any product to keep it here for later."
          action={<Link to="/products" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Explore products</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.map((item) => (
            <div key={item.id} className="relative">
              <ProductCard product={item.product} />
              <Button
                variant="secondary"
                size="xs"
                className="absolute right-2 top-2 !bg-white/95 shadow"
                onClick={() => remove.mutate(item.product.id)}
                loading={remove.isPending}
                title="Remove from wishlist"
              >Remove</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
