export type CaptureToolbarStatus = 'closed' | 'opening' | 'running' | 'closing' | 'error'

const CAPTURE_TOOLBAR_LABEL = 'capture-toolbar'
const CAPTURE_TOOLBAR_URL = '/?window=capture-toolbar'

const isDesktopShell = () => '__TAURI_INTERNALS__' in window

export const openCaptureToolbarWindow = async () => {
  if (!isDesktopShell()) {
    throw new Error('Capture toolbar is available in the desktop shell.')
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const existingToolbar = await WebviewWindow.getByLabel(CAPTURE_TOOLBAR_LABEL)
  if (existingToolbar) {
    await existingToolbar.show()
    await existingToolbar.setFocus()
    return
  }

  const toolbar = new WebviewWindow(CAPTURE_TOOLBAR_LABEL, {
    title: 'PromptCard Capture',
    url: CAPTURE_TOOLBAR_URL,
    width: 228,
    height: 64,
    minWidth: 228,
    minHeight: 64,
    maxWidth: 228,
    maxHeight: 64,
    dragDropEnabled: false,
    resizable: false,
    fullscreen: false,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true
  })

  await new Promise<void>((resolve, reject) => {
    void toolbar.once('tauri://created', () => resolve())
    void toolbar.once('tauri://error', event => reject(new Error(String(event.payload || 'Unable to open capture toolbar.'))))
  })
  await toolbar.setFocus()
}

export const closeCaptureToolbarWindow = async () => {
  if (!isDesktopShell()) {
    throw new Error('Capture toolbar is available in the desktop shell.')
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const existingToolbar = await WebviewWindow.getByLabel(CAPTURE_TOOLBAR_LABEL)
  if (existingToolbar) {
    await existingToolbar.close()
  }
}
