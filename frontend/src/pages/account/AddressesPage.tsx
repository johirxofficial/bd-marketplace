import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import type { Address } from '../../lib/types'
import { AddressForm, type AddressPayload } from '../../components/AddressForm'
import { Button, EmptyState, ErrorState, Loading, Modal, useToast } from '../../components/ui'

export default function AddressesPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [editing, setEditing] = useState<Address | null>(null)
  const [open, setOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get('/addresses')).data.addresses as Address[],
  })

  const save = useMutation({
    mutationFn: async ({ id, payload }: { id?: number; payload: AddressPayload }) =>
      id ? (await api.patch(`/addresses/${id}`, payload)).data : (await api.post('/addresses', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setOpen(false)
      setEditing(null)
      push('Address saved.')
    },
  })

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/addresses/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      push('Address removed.')
    },
    onError: (err) => push(apiError(err, 'Could not remove this address.'), 'error'),
  })

  const makeDefault = useMutation({
    mutationFn: async (id: number) => (await api.post(`/addresses/${id}/default`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      push('Default address updated.')
    },
  })

  if (isLoading) return <Loading label="Loading addresses…" />
  if (error) return <ErrorState message="Addresses could not be loaded." onRetry={() => refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Delivery addresses</h2>
          <p className="mt-0.5 text-xs text-slate-500">Saved addresses appear at checkout. Your default is selected first.</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>+ Add address</Button>
      </div>

      {!data?.length ? (
        <EmptyState title="No delivery addresses" description="Add an address to be able to check out." action={<Button size="sm" onClick={() => setOpen(true)}>Add your first address</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((address) => (
            <div key={address.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    {address.label}
                    {address.is_default && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Default</span>}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{address.recipient_name} · {address.phone}</p>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {address.street_address}
                {address.area ? `, ${address.area}` : ''}
                {address.upazila ? `, ${address.upazila}` : ''}
                {`, ${address.district}, ${address.division}`}
                {address.postal_code ? ` ${address.postal_code}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="xs" variant="secondary" onClick={() => { setEditing(address); setOpen(true) }}>Edit</Button>
                {!address.is_default && <Button size="xs" variant="ghost" onClick={() => makeDefault.mutate(address.id)} loading={makeDefault.isPending}>Set default</Button>}
                <Button size="xs" variant="ghost" className="!text-rose-600 hover:!bg-rose-50" onClick={() => { if (window.confirm(`Remove the “${address.label}” address?`)) remove.mutate(address.id) }} loading={remove.isPending}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null) }} title={editing ? 'Edit delivery address' : 'Add delivery address'}>
        <AddressForm
          initial={editing || undefined}
          submitLabel={editing ? 'Update address' : 'Save address'}
          onSubmit={async (payload) => { await save.mutateAsync({ id: editing?.id, payload }) }}
          onCancel={() => { setOpen(false); setEditing(null) }}
        />
      </Modal>
    </div>
  )
}
