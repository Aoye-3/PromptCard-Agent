
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { FloatingCaptureToolbar } from './features/capture/FloatingCaptureToolbar.tsx'
import { I18nProvider } from './i18n.tsx'
import './styles/global.css'

const isCaptureToolbarWindow = new URLSearchParams(window.location.search).get('window') === 'capture-toolbar'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      {isCaptureToolbarWindow ? <FloatingCaptureToolbar /> : <App />}
    </I18nProvider>
  </React.StrictMode>,
)
