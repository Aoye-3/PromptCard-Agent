import { describe, expect, test } from 'vitest'
import {
  PROJECT_MATERIAL_DRAG_MIME,
  isProjectMaterialDrag,
  readProjectMaterialDrag
} from './project-resource-drag'

const dataTransfer = (value: string, types = [PROJECT_MATERIAL_DRAG_MIME]) => ({
  types,
  getData: (type: string) => type === PROJECT_MATERIAL_DRAG_MIME ? value : ''
}) as unknown as DataTransfer

describe('project material drag payload', () => {
  test('reads a valid same-project material payload', () => {
    const payload = {
      projectId: 'project-a',
      id: 'material-a',
      name: 'Reference building',
      sourceAssetId: 'source-a',
      previewAssetId: 'preview-a',
      width: 941,
      height: 1672
    }
    const transfer = dataTransfer(JSON.stringify(payload))

    expect(isProjectMaterialDrag(transfer)).toBe(true)
    expect(readProjectMaterialDrag(transfer)).toEqual(payload)
  })

  test('rejects malformed or non-image-sized payloads', () => {
    expect(readProjectMaterialDrag(dataTransfer('not-json'))).toBeNull()
    expect(readProjectMaterialDrag(dataTransfer(JSON.stringify({
      projectId: 'project-a',
      id: 'material-a',
      name: 'Broken',
      sourceAssetId: 'source-a',
      previewAssetId: 'preview-a',
      width: 0,
      height: 100
    })))).toBeNull()
    expect(readProjectMaterialDrag(dataTransfer('{}', []))).toBeNull()
  })
})
