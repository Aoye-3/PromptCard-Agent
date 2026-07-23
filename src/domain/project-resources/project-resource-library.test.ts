import { describe, expect, test } from 'vitest'
import {
  appendSubjectReference,
  buildFolderPath,
  canMoveFolder,
  moveProjectResource
} from './project-resource-library'
import type { ProjectResource, ProjectResourceFolder } from '@/storage/storage-service-client'

const folder = (id: string, parentId: string | null): ProjectResourceFolder => ({
  id,
  projectId: 'project-1',
  parentId,
  name: id,
  sortOrder: 0,
  revision: 1,
  createdAt: 1,
  updatedAt: 1
})

const resource = (id: string, kind: 'subject' | 'material', folderId: string | null): ProjectResource => ({
  id,
  projectId: 'project-1',
  kind,
  name: id,
  sourceAssetId: `source-${id}`,
  previewAssetId: `preview-${id}`,
  providerAssetId: `provider-${id}`,
  width: 640,
  height: 480,
  contentType: 'image/png',
  folderId,
  sortOrder: 0,
  revision: 1,
  createdAt: 1,
  updatedAt: 1
})

describe('project resource library domain', () => {
  test('rejects moving a folder into one of its descendants', () => {
    const folders = [folder('parent', null), folder('child', 'parent'), folder('grandchild', 'child')]

    expect(canMoveFolder(folders, 'parent', 'grandchild')).toBe(false)
    expect(canMoveFolder(folders, 'child', null)).toBe(true)
    expect(buildFolderPath(folders, 'grandchild')).toBe('parent / child / grandchild')
  })

  test('moves materials between folders but keeps subjects folderless', () => {
    expect(moveProjectResource(resource('material', 'material', 'old'), 'new', 3)).toMatchObject({
      folderId: 'new',
      sortOrder: 3
    })
    expect(moveProjectResource(resource('subject', 'subject', null), 'new', 2)).toMatchObject({
      folderId: null,
      sortOrder: 2
    })
  })

  test('appends one subject reference while enforcing duplicate and model limits', () => {
    const subject = resource('hero', 'subject', null)
    const first = appendSubjectReference([], subject, 2)

    expect(first.reason).toBeNull()
    expect(first.inputs[0]).toMatchObject({
      assetId: 'provider-hero',
      sourceAssetId: 'source-hero',
      role: 'reference-image',
      order: 0
    })
    expect(appendSubjectReference(first.inputs, subject, 2).reason).toBe('duplicate')
    expect(appendSubjectReference(
      [...first.inputs, { ...first.inputs[0], referenceId: 'second', assetId: 'provider-second', order: 1 }],
      resource('third', 'subject', null),
      2
    ).reason).toBe('limit')
  })
})
