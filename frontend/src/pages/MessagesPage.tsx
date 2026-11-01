import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { dateTime, timeAgo } from '../lib/format'
import type { ChatMessage, ChatUser, Conversation } from '../lib/types'
import { UserAvatar, userRoleStyle } from '../components/UserAvatar'
import { Badge, Button, EmptyState, Field, Input, Loading, Modal, useToast, cn } from '../components/ui'

const roleTone = (role?: string) => role === 'admin' ? 'red' : role === 'manager' ? 'indigo' : role === 'support' ? 'blue' : role === 'seller' ? 'green' : 'slate'

const emptyThread: ChatMessage[] = []

export default function MessagesPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [params, setParams] = useSearchParams()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [body, setBody] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get('/messages/conversations')).data.conversations as Conversation[],
    refetchInterval: 15_000,
  })

  const thread = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: async () => (await api.get(`/messages/conversations/${activeId}`)).data as { conversation: Conversation; messages: ChatMessage[] },
    enabled: !!activeId,
    refetchInterval: 5_000,
  })

  // Starting a conversation from the "New message" dialog, or from an admin
  // user row via ?user=<id>.
  const start = useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await api.post('/messages/conversations', { user_id: userId })
      return data as { conversation: Conversation }
    },
    onSuccess: (data) => {
      setActiveId(data.conversation.id)
      setComposeOpen(false)
      setSearch('')
      setTerm('')
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
    onError: (error) => push(apiError(error, 'The conversation could not be started.'), 'error'),
  })

  const userParam = params.get('user')

  useEffect(() => {
    if (!userParam) return

    const id = Number(userParam)
    if (!Number.isFinite(id) || id <= 0) return

    start.mutate(id)

    const next = new URLSearchParams(params)
    next.delete('user')
    setParams(next, { replace: true })
  }, [userParam])

  // Debounce the people search so typing does not flood the API.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const people = useQuery({
    queryKey: ['message-users', term],
    queryFn: async () => (await api.get('/messages/users', { params: { search: term } })).data.users as ChatUser[],
    enabled: composeOpen && term.length >= 2,
  })

  const send = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/messages/conversations/${activeId}/messages`, { body: body.trim() })
      return data
    },
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['conversation', activeId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] })
    },
    onError: (error) => push(apiError(error, 'Your message could not be sent.'), 'error'),
  })

  // Opening or polling a thread marks it read on the server, so refresh the
  // header badge and the conversation list.
  const messageCount = thread.data?.messages.length ?? 0
  useEffect(() => {
    if (!activeId || !thread.data) return
    queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] })
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [activeId, messageCount])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messageCount, activeId])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!activeId || !body.trim() || send.isPending) return
    send.mutate()
  }

  const activeConversation = thread.data?.conversation
    ?? conversations.data?.find((conversation) => conversation.id === activeId)
  const messages = thread.data?.messages ?? emptyThread
  const other = activeConversation?.other_user
  const roleStyle = userRoleStyle(other?.role)

  return (
    <div className="container-page py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">Inbox</p>
          <h1 className="mt-0.5 text-xl text-slate-900 sm:text-2xl">Messages</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Chat directly with customers, sellers, and marketplace staff. Search by name, email, or phone to start a conversation.</p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>
          <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New message
        </Button>
      </div>

      <div className="card grid min-h-[520px] overflow-hidden lg:h-[calc(100vh-250px)] lg:grid-cols-[340px_1fr]">
        <aside className={cn('flex-col border-slate-200 lg:flex lg:border-r', activeId ? 'hidden' : 'flex')}>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Conversations</p>
            <span className="text-[10px] text-slate-400">{conversations.data?.length ?? 0}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.isLoading ? (
              <Loading label="Loading conversations…" />
            ) : conversations.error ? (
              <div className="p-3"><EmptyState title="Could not load conversations" action={<Button size="sm" variant="secondary" onClick={() => conversations.refetch()}>Try again</Button>} /></div>
            ) : !conversations.data?.length ? (
              <div className="p-4">
                <EmptyState
                  title="No conversations yet"
                  description="Search for a person by name or email to send your first message."
                  action={<Button size="sm" onClick={() => setComposeOpen(true)}>Start chatting</Button>}
                />
              </div>
            ) : conversations.data.map((conversation) => {
              const person = conversation.other_user
              const preview = conversation.last_message
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50',
                    activeId === conversation.id && 'bg-brand-50/60',
                  )}
                >
                  <UserAvatar name={person?.name} role={person?.role} avatarUrl={person?.avatar_url} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-bold text-slate-800">{person?.name || 'Marketplace user'}</span>
                      <span className="shrink-0 text-[9px] text-slate-400">{conversation.last_message_at ? timeAgo(conversation.last_message_at) : ''}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className={cn('truncate text-[11px]', conversation.unread_count > 0 ? 'font-semibold text-slate-700' : 'text-slate-500')}>
                        {preview ? `${preview.mine ? 'You: ' : ''}${preview.body}` : 'No messages yet'}
                      </span>
                      {conversation.unread_count > 0 && (
                        <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
                          {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className={cn('min-w-0 flex-col', activeId ? 'flex' : 'hidden lg:flex')}>
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /><path d="M8 11h8M8 15h5" /></svg>
              </div>
              <p className="text-sm font-semibold text-slate-800">Select a conversation</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Choose a chat on the left, or search for a person by name or email to start a new one.</p>
              <Button className="mt-4" size="sm" onClick={() => setComposeOpen(true)}>Start a conversation</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setActiveId(null)} aria-label="Back to conversations">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <UserAvatar name={other?.name} role={other?.role} avatarUrl={other?.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{other?.name || 'Conversation'}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {other?.role_label || roleStyle.label} · {other?.email}
                  </p>
                </div>
                {other?.role && <Badge tone={roleTone(other.role)} className="hidden sm:inline-flex">{other.role_label || roleStyle.label}</Badge>}
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-3 sm:p-4">
                {thread.isLoading ? (
                  <Loading label="Loading messages…" />
                ) : thread.error ? (
                  <EmptyState title="Could not load this conversation" action={<Button size="sm" variant="secondary" onClick={() => thread.refetch()}>Try again</Button>} />
                ) : !messages.length ? (
                  <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">Say hello to {other?.name?.split(' ')[0] || 'them'}</p>
                    <p className="mt-1 max-w-sm text-xs text-slate-500">This is the beginning of your conversation. Only the two of you can read it.</p>
                  </div>
                ) : messages.map((message) => (
                  <div key={message.id} className={cn('flex items-end gap-1.5', message.mine ? 'justify-end' : 'justify-start')}>
                    {!message.mine && <UserAvatar name={message.sender_name || other?.name} role={other?.role} size="xs" showBadge={false} />}
                    <div className={cn(
                      'max-w-[82%] rounded-2xl px-3 py-2 text-[13px] shadow-sm sm:max-w-[70%]',
                      message.mine
                        ? 'rounded-br-md bg-brand-500 text-white'
                        : 'rounded-bl-md bg-white text-slate-700 ring-1 ring-slate-200',
                    )}>
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <p className={cn('mt-1 text-right text-[9px]', message.mine ? 'text-white/70' : 'text-slate-400')}>{dateTime(message.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={submit} className="border-t border-slate-200 bg-white p-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        submit(event)
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={`Message ${other?.name?.split(' ')[0] || ''}…`}
                    className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
                    aria-label="Message"
                  />
                  <Button type="submit" disabled={!body.trim()} loading={send.isPending}>Send</Button>
                </div>
                <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] text-slate-400">
                  <span>Enter to send · Shift + Enter for a new line</span>
                  <span>{body.length}/2000</span>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New message">
        <div className="space-y-4">
          <Field label="Find a person" hint="Search by name, email address, or phone number. Only active accounts can be messaged.">
            <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. nadia@example.com" />
          </Field>

          {term.length < 2 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">Type at least 2 characters to search.</p>
          ) : people.isLoading ? (
            <Loading label="Searching people…" />
          ) : people.error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-3 text-xs text-rose-700">{apiError(people.error, 'Search failed. Please try again.')}</p>
          ) : !people.data?.length ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">No active accounts matched “{term}”.</p>
          ) : (
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {people.data.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  disabled={start.isPending}
                  onClick={() => start.mutate(person.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <UserAvatar name={person.name} role={person.role} avatarUrl={person.avatar_url} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800">{person.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{person.email}</span>
                  </span>
                  <Badge tone={roleTone(person.role)}>{person.role_label || userRoleStyle(person.role).label}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
