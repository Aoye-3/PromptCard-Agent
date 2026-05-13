
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { I18nProvider } from './i18n.tsx'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
