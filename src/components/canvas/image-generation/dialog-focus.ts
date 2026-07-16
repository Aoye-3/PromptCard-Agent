import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export const trapFocusWithinDialog = (
  event: Pick<ReactKeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>,
  dialog: HTMLElement,
  activeElement: Element | null = typeof document === 'undefined' ? null : document.activeElement
): boolean => {
  if (event.key !== 'Tab') return false
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ))
  if (!focusable.length) return false
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && activeElement === first) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}
