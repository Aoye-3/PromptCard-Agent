import { describe, expect, it } from 'vitest'
import {
  BUILDER_TEMPLATES,
  createBuilderTemplateProjectTitle,
  getBuilderTemplateById,
  getBuilderTemplateModules,
  getBuilderTemplatePage
} from './builder-templates'

describe('builder templates', () => {
  it('registers one template for every current project type', () => {
    expect(BUILDER_TEMPLATES.map(template => template.projectType)).toEqual([
      'three-stage',
      'card',
      'storyboard',
      'three-stage'
    ])
  })

  it('keeps template ids unique and addressable', () => {
    const ids = BUILDER_TEMPLATES.map(template => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getBuilderTemplateById('card').projectType).toBe('card')
  })

  it('returns clamped paginated template pages', () => {
    expect(getBuilderTemplatePage(1, 2)).toMatchObject({
      page: 1,
      pageCount: 2,
      pageSize: 2,
      total: 4
    })
    expect(getBuilderTemplatePage(99, 2)).toMatchObject({
      page: 2,
      pageCount: 2
    })
  })

  it('creates project titles from template type counts', () => {
    expect(createBuilderTemplateProjectTitle(getBuilderTemplateById('storyboard'), [
      { type: 'card' },
      { type: 'storyboard' }
    ])).toBe('分镜项目 2')
  })

  it('keeps builder mode modules separate from display pagination', () => {
    const modules = getBuilderTemplateModules('three-stage')
    expect(modules[0].id).toBe('three-stage-section-stack')
    expect(modules[0].children?.map(module => module.id)).toContain('three-stage-prompt-injection')
  })

  it('keeps the free canvas template first and backed by three-stage projects', () => {
    expect(BUILDER_TEMPLATES[0]).toMatchObject({
      id: 'free-canvas',
      projectType: 'three-stage'
    })
    expect(getBuilderTemplateModules('free-canvas')[0].children?.map(module => module.id)).toContain('free-canvas-media-layer')
  })
})
