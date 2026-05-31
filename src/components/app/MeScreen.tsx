import { ChevronRight, Clock, Download, Info, Languages, Power, Settings, Smile, Upload, Wand2 } from 'lucide-react'
import type { IUserSettings } from '@/models/UserSettings.model'

const autoSaveDelayOptions = [3, 5, 10, 20, 30]

export const MeScreen = ({
  language,
  setLanguage,
  showSettings,
  setShowSettings,
  settings,
  onSettingsChange,
  onExportData
}: {
  language: 'zh' | 'en'
  setLanguage: (language: 'zh' | 'en') => void
  showSettings: boolean
  setShowSettings: (value: boolean) => void
  settings: IUserSettings
  onSettingsChange: (settings: Partial<IUserSettings>) => void
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
              <Clock className="h-5 w-5" />
              <h2 className="text-lg font-bold">自动保存</h2>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">停止编辑后自动保存</div>
                <div className="mt-1 text-xs text-gray-500">关闭后仍可在项目页手动保存。</div>
              </div>
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  settings.autoSave ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'
                }`}
                onClick={() => onSettingsChange({ autoSave: !settings.autoSave })}
              >
                {settings.autoSave ? '已开启' : '已关闭'}
              </button>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">空闲保存等待时间</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                value={settings.autoSaveIdleSeconds}
                disabled={!settings.autoSave}
                onChange={(event) => onSettingsChange({ autoSaveIdleSeconds: Number(event.target.value) })}
              >
                {autoSaveDelayOptions.map(seconds => (
                  <option key={seconds} value={seconds}>{seconds} 秒</option>
                ))}
              </select>
            </label>
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
