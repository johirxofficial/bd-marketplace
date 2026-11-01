import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime } from '../../lib/format'
import { Badge, Button, EmptyState, Loading, Modal, PageHeader, Textarea, useToast } from '../../components/ui'

type PluginRecord = {
  plugin_id: string
  name: string
  version: string
  description?: string | null
  author?: string | null
  class: string
  installed: boolean
  enabled: boolean
  config?: Record<string, any> | null
  discovered_at?: string | null
  missing?: boolean
}

type PluginsResponse = {
  plugins: PluginRecord[]
  hooks: { filters: number; actions: number }
  plugin_path: string
}

export default function AdminPluginsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [configTarget, setConfigTarget] = useState<PluginRecord | null>(null)
  const [configDraft, setConfigDraft] = useState('')
  const [configError, setConfigError] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-plugins'],
    queryFn: async () => (await api.get('/admin/plugins')).data as PluginsResponse,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-plugins'] })
    queryClient.invalidateQueries({ queryKey: ['public-settings'] })
  }

  const sync = useMutation({
    mutationFn: async () => (await api.post('/admin/plugins/sync')).data,
    onSuccess: (result) => {
      refresh()
      push(result?.message || 'Plugins synchronized.')
    },
    onError: (err) => push(apiError(err, 'Plugins could not be synchronized.'), 'error'),
  })

  const toggle = useMutation({
    mutationFn: async ({ plugin, enabled }: { plugin: PluginRecord; enabled: boolean }) =>
      (await api.patch(`/admin/plugins/${plugin.plugin_id}`, { enabled })).data,
    onSuccess: (result) => {
      refresh()
      push(result?.message || 'Plugin updated.')
    },
    onError: (err) => push(apiError(err, 'The plugin could not be updated.'), 'error'),
  })

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!configTarget) throw new Error('No plugin selected.')
      let parsed: Record<string, any> = {}
      if (configDraft.trim()) {
        try {
          parsed = JSON.parse(configDraft)
        } catch {
          throw new Error('Configuration must be valid JSON.')
        }
      }
      return (await api.patch(`/admin/plugins/${configTarget.plugin_id}`, {
        enabled: configTarget.enabled,
        config: parsed,
      })).data
    },
    onSuccess: () => {
      refresh()
      setConfigTarget(null)
      setConfigDraft('')
      setConfigError('')
      push('Plugin configuration saved.')
    },
    onError: (err) => {
      const message = apiError(err, 'The plugin configuration could not be saved.')
      setConfigError(message)
      push(message, 'error')
    },
  })

  const plugins = data?.plugins || []
  const activePlugins = plugins.filter((plugin) => plugin.enabled && !plugin.missing)
  const missingPlugins = plugins.filter((plugin) => plugin.missing)

  return (
    <div>
      <PageHeader
        eyebrow="Extensions"
        title="Plugins"
        subtitle="Server-side add-ons installed under the plugins directory. Enabling a plugin activates its registered hooks on the next request. Plugin uploads are intentionally disabled for security."
        actions={
          <>
            <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>Sync manifests</Button>
          </>
        }
      />

      {isLoading ? <Loading label="Loading plugins…" /> : error ? (
        <EmptyState title="Plugins could not be loaded" description={apiError(error)} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Installed</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{plugins.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{activePlugins.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Registered hooks</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{data?.hooks.filters ?? 0} filters · {data?.hooks.actions ?? 0} actions</p>
            </div>
          </div>

          {missingPlugins.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-relaxed text-rose-700">
              <p className="font-bold">Missing plugin files</p>
              <p className="mt-1">
                {missingPlugins.map((plugin) => plugin.name).join(', ')} still {missingPlugins.length === 1 ? 'has' : 'have'} a database record but the plugin folder was removed. Disable {missingPlugins.length === 1 ? 'it' : 'them'} to stop hook errors, or restore the files and sync.
              </p>
            </div>
          )}

          {plugins.length === 0 ? (
            <EmptyState
              title="No plugins discovered"
              description="Add a plugin folder containing plugin.json under the backend plugins directory, then click Sync manifests."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {plugins.map((plugin) => (
                <div key={plugin.plugin_id} className={`card p-4 ${plugin.missing ? 'border-rose-200' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-bold text-slate-900">{plugin.name}</h2>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">v{plugin.version}</span>
                        {plugin.missing ? <Badge tone="red">Missing files</Badge> : plugin.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="slate">Disabled</Badge>}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{plugin.plugin_id}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-700" title={plugin.missing ? 'Restore the plugin files first.' : 'Toggle plugin'}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-500"
                        checked={plugin.enabled}
                        disabled={plugin.missing || toggle.isPending}
                        onChange={(event) => toggle.mutate({ plugin, enabled: event.target.checked })}
                      />
                      On
                    </label>
                  </div>

                  {plugin.description && <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{plugin.description}</p>}

                  <dl className="mt-3 space-y-1 text-[10px] text-slate-500">
                    <div className="flex gap-1"><dt className="font-semibold text-slate-600">Class:</dt><dd className="truncate font-mono">{plugin.class}</dd></div>
                    {plugin.author && <div className="flex gap-1"><dt className="font-semibold text-slate-600">Author:</dt><dd>{plugin.author}</dd></div>}
                    {plugin.discovered_at && <div className="flex gap-1"><dt className="font-semibold text-slate-600">Discovered:</dt><dd>{dateTime(plugin.discovered_at)}</dd></div>}
                  </dl>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-[10px] text-slate-400">{plugin.config && Object.keys(plugin.config).length ? `${Object.keys(plugin.config).length} config key(s)` : 'No configuration'}</p>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={plugin.missing || !plugin.installed}
                      onClick={() => {
                        setConfigTarget(plugin)
                        setConfigDraft(plugin.config ? JSON.stringify(plugin.config, null, 2) : '')
                        setConfigError('')
                      }}
                    >
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] leading-relaxed text-slate-500">
            <h2 className="text-sm font-bold text-slate-900">How plugins work</h2>
            <p className="mt-1.5">
              Each plugin is a folder under <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">{data?.plugin_path}</code> with a <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">plugin.json</code> manifest and a PHP class implementing the plugin contract.
              Plugins register filters (transform a value) and actions (side effects) using the hook bus. A faulty plugin is logged and skipped rather than crashing the storefront.
            </p>
            <p className="mt-1.5">
              For safety, administrators cannot upload plugin code through the browser. Installation is a server-side deployment step performed by a developer with filesystem access.
            </p>
          </div>
        </div>
      )}

      <Modal
        open={!!configTarget}
        onClose={() => setConfigTarget(null)}
        title={`Configure ${configTarget?.name || 'plugin'}`}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfigTarget(null)}>Cancel</Button>
            <Button size="sm" loading={saveConfig.isPending} onClick={() => saveConfig.mutate()}>Save configuration</Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-slate-600">
          Plugin configuration is stored encrypted. Enter a JSON object, or leave blank to clear all settings.
        </p>
        {configError && <p className="mt-2 rounded bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{configError}</p>}
        <Textarea
          className="mt-3 min-h-[180px] font-mono text-[11px]"
          value={configDraft}
          onChange={(event) => setConfigDraft(event.target.value)}
          placeholder={'{\n  "key": "value"\n}'}
          spellCheck={false}
        />
        <p className="mt-1 text-[10px] text-slate-400">Invalid JSON is rejected. This screen never displays secrets from other plugins.</p>
      </Modal>
    </div>
  )
}
