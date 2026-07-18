import { useState, type ReactNode } from 'react'
import { FileStorageScreen } from './FileStorageScreen'

export const RecycleBinScreen = ({ projectTrash }: { projectTrash: ReactNode }) => {
  const [tab, setTab] = useState<'projects' | 'files'>('projects')
  return (
    <section data-recycle-bin-screen className="min-h-screen bg-[#f7f7f5]">
      <div className="border-b border-gray-200 bg-white px-6 pt-6">
        <h1 className="text-3xl font-black tracking-tight text-gray-950">回收站</h1>
        <div className="mt-5 flex gap-6">
          <button type="button" aria-pressed={tab === 'projects'} onClick={() => setTab('projects')} className={`border-b-2 px-1 pb-3 text-sm font-black ${tab === 'projects' ? 'border-gray-950 text-gray-950' : 'border-transparent text-gray-400'}`}>项目</button>
          <button type="button" aria-pressed={tab === 'files'} onClick={() => setTab('files')} className={`border-b-2 px-1 pb-3 text-sm font-black ${tab === 'files' ? 'border-gray-950 text-gray-950' : 'border-transparent text-gray-400'}`}>文件</button>
        </div>
      </div>
      {tab === 'projects' ? projectTrash : <FileStorageScreen mode="trash" />}
    </section>
  )
}

export default RecycleBinScreen
