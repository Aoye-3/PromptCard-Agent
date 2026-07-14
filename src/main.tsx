
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { FloatingCaptureToolbar } from './features/capture/FloatingCaptureToolbar.tsx'
import { ScreenshotCaptureOverlay } from './features/capture/ScreenshotCaptureOverlay.tsx'
import { I18nProvider } from './i18n.tsx'
import './styles/global.css'

const windowParams = new URLSearchParams(window.location.search)
const isCaptureToolbarWindow = windowParams.get('window') === 'capture-toolbar'
const isCaptureSelectionWindow = windowParams.get('window') === 'capture-selection'
const captureSessionId = windowParams.get('session') || ''
const canPlaceOnCanvas = windowParams.get('allowCanvas') === 'true'

if (isCaptureToolbarWindow) {
  document.documentElement.dataset.window = 'capture-toolbar'
} else if (isCaptureSelectionWindow) {
  document.documentElement.dataset.window = 'capture-selection'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      {isCaptureToolbarWindow ? <FloatingCaptureToolbar /> : isCaptureSelectionWindow && captureSessionId ? <ScreenshotCaptureOverlay sessionId={captureSessionId} canPlaceOnCanvas={canPlaceOnCanvas} /> : <App />}
    </I18nProvider>
  </React.StrictMode>,
)
