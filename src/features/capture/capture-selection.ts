export type SelectionRect = { x: number; y: number; width: number; height: number }

export const mapSelectionToVideoCrop = (
  selection: SelectionRect,
  frame: { width: number; height: number },
  video: { width: number; height: number }
): SelectionRect => {
  const scale = Math.min(frame.width / video.width, frame.height / video.height)
  const renderedWidth = video.width * scale
  const renderedHeight = video.height * scale
  return mapSelectionToNativeCrop(
    { x: selection.x - (frame.width - renderedWidth) / 2, y: selection.y - (frame.height - renderedHeight) / 2, width: selection.width, height: selection.height },
    { width: renderedWidth, height: renderedHeight },
    video
  )
}

export const mapSelectionToNativeCrop = (
  selection: SelectionRect,
  selector: { width: number; height: number },
  capture: { width: number; height: number }
): SelectionRect => {
  const x = clamp(selection.x / selector.width, 0, 1) * capture.width
  const y = clamp(selection.y / selector.height, 0, 1) * capture.height
  const right = clamp((selection.x + selection.width) / selector.width, 0, 1) * capture.width
  const bottom = clamp((selection.y + selection.height) / selector.height, 0, 1) * capture.height
  return {
    x: Math.round(Math.min(x, right)),
    y: Math.round(Math.min(y, bottom)),
    width: Math.max(1, Math.round(Math.abs(right - x))),
    height: Math.max(1, Math.round(Math.abs(bottom - y)))
  }
}

export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
