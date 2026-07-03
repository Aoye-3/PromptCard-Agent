import { useMemo, useState } from 'react'
import { recentCaptureFixtures } from './media-fixtures'

export const useRecentCaptures = () => {
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null)
  const captures = recentCaptureFixtures
  const selectedCapture = useMemo(
    () => captures.find(capture => capture.id === selectedCaptureId) || null,
    [captures, selectedCaptureId]
  )

  return {
    captures,
    selectedCapture,
    selectedCaptureId,
    setSelectedCaptureId
  }
}
