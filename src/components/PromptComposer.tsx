import React, { useMemo, useState } from 'react'
import type { IPage } from '@/stores/card-initial-state'
import {
  countMixedTokens,
  countPromptSegments,
  getPromptSegments
} from '@/utils/promptComposer'
import { PROMPT_PAGE_SEPARATOR } from '@/utils/promptParser'
import { useI18n } from '@/i18n'

interface PromptComposerProps {
  pages: IPage[]
  currentPrompt: string
  selectedCardsCount: number
  duplicateMode: boolean
  duplicateCount: number
  onPromptChange: (prompt: string) => void
  onCopyPrompt: () => void
  onCopySelected: () => void
  onClearSelection: () => void
  onToggleDuplicates: () => void
}

const pageMarkerStyles = [
  'page-marker-red',
  'page-marker-blue',
  'page-marker-green',
  'page-marker-gold',
  'page-marker-violet',
  'page-marker-rose'
]

const getPageMarkerClass = (pageIndex: number): string =>
  `page-marker ${pageMarkerStyles[pageIndex % pageMarkerStyles.length]}`

const getPageTextClass = (pageIndex: number): string =>
  `prompt-page-text prompt-page-text-${pageMarkerStyles[pageIndex % pageMarkerStyles.length].replace('page-marker-', '')}`

const renderPromptWithPageTextColors = (prompt: string) => {
  if (!prompt) {
    return <span className="text-transparent"> </span>
  }

  const lines = prompt.split('\n')
  let pageIndex = 0

  return lines.map((line, index) => {
    const isSeparator = line.trim() === PROMPT_PAGE_SEPARATOR
    const className = isSeparator ? 'text-stone-gray' : getPageTextClass(pageIndex)
    const renderedLine = (
      <React.Fragment key={`${index}-${line}`}>
        <span className={className}>{line || ' '}</span>
        {index < lines.length - 1 && '\n'}
      </React.Fragment>
    )

    if (isSeparator) {
      pageIndex += 1
    }

    return renderedLine
  })
}

const PromptComposer: React.FC<PromptComposerProps> = ({
  pages,
  currentPrompt,
  selectedCardsCount,
  duplicateMode,
  duplicateCount,
  onPromptChange,
  onCopyPrompt,
  onCopySelected,
  onClearSelection,
  onToggleDuplicates
}) => {
  const { t } = useI18n()
  const [promptScrollTop, setPromptScrollTop] = useState(0)
  const wordCount = useMemo(() => countMixedTokens(currentPrompt), [currentPrompt])
  const segmentCount = useMemo(() => {
    return pages.reduce((total, page) => total + countPromptSegments(getPromptSegments(page.cards)), 0)
  }, [pages])

  const pageTimestamps = useMemo(() => {
    return pages.map((page, index) => {
      const timing = page.cards.find(card => card.type === 'timing')?.content.trim()
      return {
        label: `Page ${index + 1}`,
        timestamp: timing ? `[${timing}]` : t('unsetTimestamp')
      }
    })
  }, [pages, t])

  return (
    <section className="bg-ivory border-b border-border-warm px-6 py-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="text-sm text-stone-gray font-medium">{t('currentPrompt')}</div>
        <button
          className={`px-3 py-1.5 rounded-comfort text-sm font-medium transition ${
            duplicateMode
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'secondary-btn'
          }`}
          onClick={onToggleDuplicates}
        >
          <span className="fa fa-search mr-2"></span>
          {duplicateMode ? t('closeDuplicateMarks') : t('markDuplicates')}
        </button>
      </div>

      <div className="bg-parchment rounded-generous border border-border-cream overflow-hidden">
        <div className="relative min-h-[128px] overflow-hidden">
          <pre
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-4 font-serif text-base leading-8"
            style={{ transform: `translateY(-${promptScrollTop}px)` }}
          >
            {renderPromptWithPageTextColors(currentPrompt)}
          </pre>
          <textarea
            value={currentPrompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onScroll={(event) => setPromptScrollTop(event.currentTarget.scrollTop)}
            rows={5}
            spellCheck={false}
            placeholder={t('promptPlaceholder')}
            className="prompt-page-color-input relative z-10 block min-h-[128px] w-full resize-y overflow-y-auto border-0 bg-transparent p-4 font-serif text-base leading-8 outline-none placeholder:text-stone-gray/70 focus:ring-2 focus:ring-terracotta/30"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-ivory/70 px-4 py-2 text-xs text-stone-gray">
          <div className="flex flex-wrap gap-3">
            <span>{t('wordCount', { count: wordCount })}</span>
            <span>{t('segmentCount', { count: segmentCount })}</span>
            <span>{t('duplicateSegments', { count: duplicateMode ? duplicateCount : 0 })}</span>
          </div>
          <span>{currentPrompt ? t('editPromptSyncHint') : t('promptEmpty')}</span>
        </div>

        {pageTimestamps.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border-cream bg-white/45 px-4 py-2 text-xs">
            {pageTimestamps.map((page, index) => (
              <span
                key={`${page.label}-${page.timestamp}`}
                className={`rounded px-2 py-1 ${getPageMarkerClass(index)}`}
              >
                {page.label} {page.timestamp}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-3 flex-wrap">
        <button className="px-4 py-2 rounded-comfort text-white font-medium transition primary-btn" onClick={onCopyPrompt}>
          <span className="fa fa-copy mr-2"></span>{t('copyAllPrompt')}
        </button>
        {selectedCardsCount > 0 && (
          <>
            <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-comfort font-medium transition" onClick={onCopySelected}>
              <span className="fa fa-copy mr-2"></span>{t('copySelected', { count: selectedCardsCount })}
            </button>
            <button className="px-4 py-2 secondary-btn font-medium transition" onClick={onClearSelection}>
              <span className="fa fa-times mr-2"></span>{t('clearSelection')}
            </button>
          </>
        )}
        <button className="px-4 py-2 secondary-btn font-medium transition" onClick={() => alert(t('favoriteInProgress'))}>
          <span className="fa fa-star mr-2"></span>{t('favorite')}
        </button>
        <button className="px-4 py-2 secondary-btn font-medium transition" onClick={() => alert(t('shareInProgress'))}>
          <span className="fa fa-share-alt mr-2"></span>{t('share')}
        </button>
      </div>
    </section>
  )
}

export default React.memo(PromptComposer)
