interface ScreenshotRequestDependencies {
  emitIntent: () => Promise<void>
  setPreparing: (preparing: boolean) => void
}

export const requestScreenshot = async ({ emitIntent, setPreparing }: ScreenshotRequestDependencies) => {
  setPreparing(true)
  try {
    await emitIntent()
  } catch (error) {
    setPreparing(false)
    throw error
  }
}
