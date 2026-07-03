import { useCallback, useEffect, useMemo, useState } from 'react'
import { storage } from '@/utils/storage'
import type { RecentCaptureItemViewModel } from './media-types'
import { createRecentCaptureViewModel, RECENT_CAPTURES_CHANGED_EVENT } from './recent-capture-normalization'

export const useRecentCaptures = () => {
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null)
  const [captures, setCaptures] = useState<RecentCaptureItemViewModel[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshCaptures = useCallback(async () => {
    try {
      const storedCaptures = await storage.recentCaptures.getAll()
      setCaptures(storedCaptures.map(createRecentCaptureViewModel))
    } catch (error) {
      console.error('Failed to load recent captures:', error)
      setCaptures([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshCaptures()
    window.addEventListener(RECENT_CAPTURES_CHANGED_EVENT, refreshCaptures)
    return () => window.removeEventListener(RECENT_CAPTURES_CHANGED_EVENT, refreshCaptures)
  }, [refreshCaptures])

  const selectedCapture = useMemo(
    () => captures.find(capture => capture.id === selectedCaptureId) || null,
    [captures, selectedCaptureId]
  )

  return {
    captures,
    isLoading,
    refreshCaptures,
    selectedCapture,
    selectedCaptureId,
    setSelectedCaptureId
  }
}
