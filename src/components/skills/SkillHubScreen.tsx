import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, ChevronRight, Filter, Puzzle, Search, ShieldCheck, Wrench } from 'lucide-react'
import { storageServiceClient, type SkillSummary } from '@/storage/storage-service-client'

type SkillFilter = 'all' | 'builtin' | 'external'

export function SkillHubScreen({ initialSkills }: { initialSkills?: SkillSummary[] }) {
  const [skills, setSkills] = useState<SkillSummary[]>(initialSkills || [])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SkillFilter>('all')
  const [selected, setSelected] = useState<SkillSummary | null>(null)
  const [loading, setLoading] = useState(!initialSkills)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialSkills) return
    storageServiceClient.skills.list()
      .then(setSkills)
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [initialSkills])

  const visible = useMemo(() => skills.filter(skill => {
    const matchesFilter = filter === 'all' || skill.source === filter
    const normalized = query.trim().toLowerCase()
    const matchesQuery = !normalized || `${skill.name} ${skill.slug} ${skill.description}`.toLowerCase().includes(normalized)
    return matchesFilter && matchesQuery
  }), [filter, query, skills])

  return (
    <section className="min-h-screen bg-[#fafaf8] px-6 py-8 lg:px-10" aria-labelledby="skillhub-title">
      <header className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-600">
              <Puzzle className="h-4 w-4" /> Runtime capabilities
            </div>
            <h1 id="skillhub-title" className="text-4xl font-black tracking-tight text-gray-950">SkillHub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              管理 Agent 可读取的功能说明、引用与工具依赖。Skill 不会扩大 Runtime 权限，也不会直接执行脚本。
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 sm:flex">
            <ShieldCheck className="h-4 w-4" /> 受 Gateway 权限约束
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <span className="sr-only">搜索 Skill</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、能力或说明" className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-50" />
          </label>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1" aria-label="Skill 来源筛选">
            <Filter className="ml-2 h-4 w-4 text-gray-400" />
            {(['all', 'builtin', 'external'] as const).map(value => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-3 py-2 text-xs font-bold ${filter === value ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {value === 'all' ? '全部' : value === 'builtin' ? '内置' : '外置'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? <div className="p-10 text-center text-sm text-gray-400" role="status">正在读取 Skill…</div> : null}
        {error ? <div className="p-6 text-sm font-semibold text-red-700" role="alert">{error}</div> : null}
        {!loading && !error && visible.length === 0 ? <div className="p-10 text-center text-sm text-gray-400">没有匹配的 Skill</div> : null}
        <ul className="divide-y divide-gray-100">
          {visible.map(skill => (
            <li key={skill.id}>
              <button type="button" onClick={() => setSelected(skill)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#fafaf8] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {skill.source === 'builtin' ? <BookOpen className="h-4 w-4 text-amber-500" /> : <Puzzle className="h-4 w-4 text-sky-600" />}
                    <span className="font-bold text-gray-950">{skill.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">v{skill.revision}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-gray-500">{skill.description}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Wrench className="h-3.5 w-3.5" /> {skill.toolDependencies.join(', ') || '无需工具'}</span>
                <span className="flex items-center justify-between gap-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {skill.trustState}<ChevronRight className="h-4 w-4 text-gray-300" /></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected ? <SkillDetail skill={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}

function SkillDetail({ skill, onClose }: { skill: SkillSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/25" role="dialog" aria-modal="true" aria-label={`${skill.name} 详情`} onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="mb-6 text-sm font-bold text-gray-500 hover:text-gray-950">关闭</button>
        <h2 className="text-2xl font-black text-gray-950">{skill.name}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">{skill.description}</p>
        <dl className="mt-7 space-y-4 text-sm">
          <Detail label="稳定标识" value={skill.id} />
          <Detail label="版本摘要" value={`revision ${skill.revision} · ${skill.digest}`} />
          <Detail label="来源 / 信任" value={`${skill.source} · ${skill.trustState}`} />
          <Detail label="Capability" value={skill.capabilityId || '用户主动触发'} />
          <Detail label="工具依赖" value={skill.toolDependencies.join(', ') || '无'} />
        </dl>
      </aside>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 break-words font-medium text-gray-800">{value}</dd></div>
}
