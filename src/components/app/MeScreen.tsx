import { ChevronRight, Download, Info, Languages, Power, Settings, Smile, Upload, Wand2 } from 'lucide-react'

export const MeScreen = ({
  language,
  setLanguage,
  showSettings,
  setShowSettings,
  onExportData
}: {
  language: 'zh' | 'en'
  setLanguage: (language: 'zh' | 'en') => void
  showSettings: boolean
  setShowSettings: (value: boolean) => void
  onExportData: () => void
}) => {
  const handleShutdownDevServer = async () => {
    const confirmed = window.confirm('确定关闭当前开发服务器吗？页面会断开连接。')
    if (!confirmed) return

    try {
      await fetch('/__promptcard/dev-server/shutdown', { method: 'POST' })
      window.setTimeout(() => {
        document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;color:#111827;background:#f8fafc;"><div style="text-align:center;"><div style="font-size:22px;font-weight:800;margin-bottom:8px;">开发服务器已关闭</div><div style="font-size:14px;color:#6b7280;">需要继续测试时，请重新启动 dev server。</div></div></div>'
      }, 300)
    } catch (error) {
      window.alert('关闭开发服务器失败，请在终端手动停止。')
    }
  }

  const rows = [
    { icon: Info, label: '关于我们', action: undefined },
    { icon: Wand2, label: '产品反馈', action: undefined },
    { icon: Upload, label: '专业版', action: undefined },
    { icon: Download, label: '导出记录', action: onExportData },
    { icon: Settings, label: '设置', action: () => setShowSettings(!showSettings) }
  ]

  return (
    <section className="px-6 pt-5">
      <div className="mb-10 flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-300">
          <Smile className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold">开发者 001</h1>
      </div>
      <div className="space-y-2">
        {rows.map(row => {
          const Icon = row.icon
          return (
            <button key={row.label} className="flex w-full items-center justify-between rounded-2xl px-4 py-5 text-left transition hover:bg-gray-50" onClick={row.action}>
              <span className="flex items-center gap-4 text-lg font-semibold">
                <Icon className="h-7 w-7" />
                {row.label}
              </span>
              <ChevronRight className="h-6 w-6 text-gray-950" />
            </button>
          )
        })}
      </div>
      {showSettings && (
        <div className="mt-6 max-w-xl rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center gap-3">
            <Languages className="h-5 w-5" />
            <h2 className="text-lg font-bold">语言</h2>
          </div>
          <div className="flex gap-3">
            <button className={`rounded-full px-5 py-2 text-sm font-semibold ${language === 'zh' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setLanguage('zh')}>
              中文
            </button>
            <button className={`rounded-full px-5 py-2 text-sm font-semibold ${language === 'en' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setLanguage('en')}>
              English
            </button>
          </div>
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="mb-4 flex items-center gap-3">
              <Power className="h-5 w-5" />
              <h2 className="text-lg font-bold">开发服务器</h2>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-red-50 px-5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
              onClick={handleShutdownDevServer}
            >
              <Power className="h-4 w-4" />
              关闭开发服务器
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
