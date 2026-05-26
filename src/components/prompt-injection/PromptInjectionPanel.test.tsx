import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import {
  createPromptInjectionEvent,
  type PromptInjectionAction
} from '@/domain/prompt-injection/prompt-injection'
import { PromptInjectionPanel } from './PromptInjectionPanel'

const preset = (id: string, type: IPreset['type'], label: string, content: string): IPreset => ({
  id,
  type,
  category: type,
  label,
  content,
  usageCount: 0,
  meta: {}
})

const actions: PromptInjectionAction[] = [
  { id: 'copy', label: 'Copy' },
  { id: 'append', label: 'Add to current card', requiresTarget: true },
  { id: 'replace', label: 'Replace', requiresTarget: true },
  { id: 'create-card', label: 'New card' }
]

describe('PromptInjectionPanel', () => {
  test('renders card-mode types and card actions without owning a card store', () => {
    const markup = renderToStaticMarkup(
      <PromptInjectionPanel
        title="Creative Mode"
        activeType="subject"
        availableTypes={['subject', 'action']}
        presets={[
          preset('subject-1', 'subject', 'General subject', 'subject prompt'),
          preset('action-1', 'action', 'Run', 'run prompt')
        ]}
        actions={actions}
        selectedTargetLabel="Hero card"
        getTypeLabel={(type) => (type === 'subject' ? 'Subject' : 'Action')}
        onTypeChange={() => undefined}
        onSearchChange={() => undefined}
        onApplyPreset={() => undefined}
      />
    )

    expect(markup).toContain('Subject')
    expect(markup).toContain('Action')
    expect(markup).toContain('General subject')
    expect(markup).toContain('Add to current card')
    expect(markup).toContain('New card')
    expect(markup).toContain('Hero card')
  })

  test('renders field-mode actions for only the supplied preset type', () => {
    const markup = renderToStaticMarkup(
      <PromptInjectionPanel
        title="Prompt library camera options"
        activeType="camera"
        availableTypes={['camera']}
        presets={[
          preset('camera-1', 'camera', 'Push in', 'push in slowly'),
          preset('subject-1', 'subject', 'Person', 'person')
        ]}
        actions={[
          { id: 'append', label: 'Append' },
          { id: 'replace', label: 'Replace' }
        ]}
        getTypeLabel={() => 'Camera'}
        onTypeChange={() => undefined}
        onSearchChange={() => undefined}
        onApplyPreset={() => undefined}
      />
    )

    expect(markup).toContain('Camera')
    expect(markup).toContain('Push in')
    expect(markup).not.toContain('Person')
    expect(markup).toContain('Append')
    expect(markup).toContain('Replace')
    expect(markup).not.toContain('New card')
  })

  test('creates action events without mutating presets', () => {
    const source = preset('camera-1', 'camera', 'Push in', 'push in slowly')
    const before = JSON.stringify(source)
    const event = createPromptInjectionEvent(source, 'replace')

    expect(event).toEqual({ preset: source, actionId: 'replace' })
    expect(JSON.stringify(source)).toBe(before)
  })
})
