import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StorageArtifact, StorageUsageSummary } from '@/storage/storage-service-client'
import { FileStorageScreenView } from './FileStorageScreen'
import { RecycleBinScreen } from './RecycleBinScreen'

const summary: StorageUsageSummary = {
  userAssetBytes: 1024,
  activeBytes: 768,
  trashBytes: 256,
  internalDerivativeBytes: 128,
  systemBytes: 64,
  orphanBytes: 32,
  assetSoftThresholdBytes: 10 * 1024,
  assetWarningLevel: 'normal',
  diskTotalBytes: 100 * 1024,
  diskFreeBytes: 60 * 1024,
  diskWarningLevel: 'normal',
  artifactCount: 1
}

const artifact: StorageArtifact = {
  assetId: 'asset-one.png',
  familyAssetIds: ['asset-one.png'],
  category: 'generated-content',
  status: 'active',
  title: 'Generated apple.png',
  contentType: 'image/png',
  mediaType: 'image',
  sizeBytes: 1024,
  createdAt: 1,
  trashedAt: null,
  referenceCount: 0,
  previewUrl: '/storage-api/assets/asset-one.png'
}

describe('FileStorageScreenView', () => {
  it('renders generated content as the default source category with capacity and core actions', () => {
    const markup = renderToStaticMarkup(
      <FileStorageScreenView
        mode="active"
        category="generated-content"
        summary={summary}
        artifacts={[artifact]}
        selectedIds={[]}
        loading={false}
        query=""
        mediaType=""
        sort="created-desc"
        onCategoryChange={() => undefined}
        onQueryChange={() => undefined}
        onMediaTypeChange={() => undefined}
        onSortChange={() => undefined}
        onToggleSelection={() => undefined}
        onTrash={() => undefined}
        onRestore={() => undefined}
        onDeleteForever={() => undefined}
        onShowReferences={() => undefined}
        onReconcileOrphans={() => undefined}
      />
    )

    expect(markup).toContain('data-file-storage-screen')
    expect(markup).toContain('data-file-category="generated-content"')
    expect(markup).toContain('生成内容')
    expect(markup).toContain('外部媒体')
    expect(markup).toContain('项目素材')
    expect(markup).toContain('其他文件')
    expect(markup).toContain('Generated apple.png')
    expect(markup).toContain('导出原文件')
    expect(markup).toContain('移入回收站')
  })

  it('renders restore and permanent delete actions in file trash mode', () => {
    const markup = renderToStaticMarkup(
      <FileStorageScreenView
        mode="trash"
        category="generated-content"
        summary={summary}
        artifacts={[{ ...artifact, status: 'trash' }]}
        selectedIds={['asset-one.png']}
        loading={false}
        query=""
        mediaType=""
        sort="created-desc"
        onCategoryChange={() => undefined}
        onQueryChange={() => undefined}
        onMediaTypeChange={() => undefined}
        onSortChange={() => undefined}
        onToggleSelection={() => undefined}
        onTrash={() => undefined}
        onRestore={() => undefined}
        onDeleteForever={() => undefined}
        onShowReferences={() => undefined}
        onReconcileOrphans={() => undefined}
      />
    )

    expect(markup).toContain('文件回收站')
    expect(markup).toContain('恢复所选')
    expect(markup).toContain('永久删除')
  })
})

describe('RecycleBinScreen', () => {
  it('keeps project and file trash under one sidebar destination', () => {
    const markup = renderToStaticMarkup(
      <RecycleBinScreen projectTrash={<div data-project-trash-panel />} />
    )

    expect(markup).toContain('data-recycle-bin-screen')
    expect(markup).toContain('项目')
    expect(markup).toContain('文件')
    expect(markup).toContain('data-project-trash-panel')
  })
})
