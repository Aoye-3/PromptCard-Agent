import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, GitBranch, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import {
  desktopShellService,
  type UpdateChange,
  type UpdateResult,
  type UpdateSourceConfig
} from '@/services/desktop-shell-service'

const emptyConfig: UpdateSourceConfig = {
  repoUrl: '',
  remoteName: 'origin',
  branch: 'main',
  lastKnownRemoteCommit: null,
  lastCheckedAt: null
}

type UpdateAction = 'load' | 'save' | 'check' | 'preview' | 'apply'

const shortCommit = (commit: string) => commit ? commit.slice(0, 12) : 'unknown'

const formatCheckedAt = (value?: number | null) => {
  if (!value) return 'Never checked'
  return new Date(value * 1000).toLocaleString()
}

const classificationLabel: Record<UpdateChange['classification'], string> = {
  source: 'Source',
  protected: 'Protected',
  'manual-review': 'Manual review'
}

const classificationClassName: Record<UpdateChange['classification'], string> = {
  source: 'bg-emerald-50 text-emerald-700',
  protected: 'bg-red-50 text-red-700',
  'manual-review': 'bg-amber-50 text-amber-700'
}

export const UpdateScreen = () => {
  const isDesktopShell = desktopShellService.isAvailable()
  const [config, setConfig] = useState<UpdateSourceConfig>(emptyConfig)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<UpdateAction | null>(isDesktopShell ? 'load' : null)

  useEffect(() => {
    if (!isDesktopShell) return

    let cancelled = false
    desktopShellService.getUpdateConfig()
      .then(nextConfig => {
        if (!cancelled) setConfig(nextConfig)
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        if (!cancelled) setActiveAction(null)
      })

    return () => {
      cancelled = true
    }
  }, [isDesktopShell])

  const hasBlockedReasons = Boolean(result?.blockedReasons.length)
  const canRunCommands = isDesktopShell && activeAction === null
  const changeSummary = useMemo(() => {
    if (!result) return 'No preview loaded'
    if (result.changes.length === 0) return 'No source changes'
    return `${result.changes.length} changed path${result.changes.length === 1 ? '' : 's'}`
  }, [result])

  const runAction = async (action: UpdateAction, request: () => Promise<UpdateResult | UpdateSourceConfig>) => {
    setActiveAction(action)
    setError(null)
    try {
      const response = await request()
      if ('changes' in response) {
        setResult(response)
      } else {
        setConfig(response)
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <section className="min-h-screen bg-gray-50 px-6 py-6" data-update-screen>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-600">
            <RefreshCw className="h-4 w-4" />
            Source update
          </div>
          <h1 className="text-2xl font-bold text-gray-950">更新</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            只更新当前源码工作区。项目、提示词、媒体、日志和运行配置保留在受保护 Profile 中。
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600">
          {isDesktopShell ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {isDesktopShell ? 'Desktop shell ready' : 'Desktop shell unavailable'}
        </div>
      </div>

      {!isDesktopShell && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="status">
          更新命令只在 Tauri 桌面壳中可用。浏览器开发模式可以查看页面，但不能执行 GitHub 更新。
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-gray-500" />
              <h2 className="text-base font-bold text-gray-950">GitHub 更新源</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_160px]">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Repository URL</span>
                <input
                  className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 disabled:bg-gray-100"
                  value={config.repoUrl}
                  disabled={!isDesktopShell}
                  onChange={event => setConfig(current => ({ ...current, repoUrl: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Remote</span>
                <input
                  className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 disabled:bg-gray-100"
                  value={config.remoteName}
                  disabled={!isDesktopShell}
                  onChange={event => setConfig(current => ({ ...current, remoteName: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Branch</span>
                <input
                  className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50 disabled:bg-gray-100"
                  value={config.branch}
                  disabled={!isDesktopShell}
                  onChange={event => setConfig(current => ({ ...current, branch: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                icon={<Save className="h-4 w-4" />}
                label="保存配置"
                loading={activeAction === 'save'}
                disabled={!canRunCommands}
                onClick={() => runAction('save', () => desktopShellService.saveUpdateConfig(config))}
              />
              <ActionButton
                icon={<RefreshCw className="h-4 w-4" />}
                label="检查更新"
                loading={activeAction === 'check'}
                disabled={!canRunCommands}
                onClick={() => runAction('check', () => desktopShellService.checkForUpdates())}
              />
              <ActionButton
                icon={<GitBranch className="h-4 w-4" />}
                label="预览差异"
                loading={activeAction === 'preview'}
                disabled={!canRunCommands}
                onClick={() => runAction('preview', () => desktopShellService.previewUpdate())}
              />
              <ActionButton
                variant="dark"
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="执行更新"
                loading={activeAction === 'apply'}
                disabled={!canRunCommands}
                onClick={() => runAction('apply', () => desktopShellService.applyUpdate())}
              />
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-gray-950">差异预览</h2>
              <span className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{changeSummary}</span>
            </div>
            {result?.changes.length ? (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                {result.changes.map(change => (
                  <div key={change.path} className="grid gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)]">
                    <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${classificationClassName[change.classification]}`}>
                      {classificationLabel[change.classification]}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-950" title={change.path}>{change.path}</div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">{change.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
                先检查或预览更新，安全分类会显示在这里。
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-base font-bold text-gray-950">当前状态</h2>
            <StatusRow label="Local" value={shortCommit(result?.currentCommit || '')} />
            <StatusRow label="Remote" value={shortCommit(result?.remoteCommit || config.lastKnownRemoteCommit || '')} />
            <StatusRow label="Branch" value={result?.branch || config.branch} />
            <StatusRow label="Last check" value={formatCheckedAt(config.lastCheckedAt)} />
            {result?.backupPath && <StatusRow label="Backup" value={result.backupPath} />}
            {result?.requiresDependencyInstall && (
              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                本次更新包含依赖清单变化。更新后需要重启，并在当前工作区内重新安装依赖。
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-base font-bold text-gray-950">阻断原因</h2>
            {hasBlockedReasons ? (
              <ul className="space-y-2">
                {result?.blockedReasons.map(reason => (
                  <li key={reason} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                当前没有阻断原因。
              </div>
            )}
            {result?.message && (
              <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold leading-5 text-gray-600">
                {result.message}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

const ActionButton = ({
  disabled,
  icon,
  label,
  loading,
  onClick,
  variant = 'light'
}: {
  disabled: boolean
  icon: ReactNode
  label: string
  loading: boolean
  onClick: () => void
  variant?: 'light' | 'dark'
}) => (
  <button
    type="button"
    className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
      variant === 'dark'
        ? 'bg-gray-950 text-white hover:bg-gray-800'
        : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
    }`}
    disabled={disabled}
    onClick={onClick}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    {label}
  </button>
)

const StatusRow = ({ label, value }: { label: string; value: string }) => (
  <div className="border-b border-gray-100 py-3 last:border-b-0">
    <div className="text-xs font-semibold uppercase text-gray-400">{label}</div>
    <div className="mt-1 break-all text-sm font-bold text-gray-900">{value || 'unknown'}</div>
  </div>
)
