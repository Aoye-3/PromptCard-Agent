const minimumComposerHeight = 168
const fallbackMaximumComposerHeight = 480
const conversationHeaderHeight = 40
const resizeHandleHeight = 12
const minimumConversationHeight = 160

export const getImageComposerHeightBounds = (panelHeight: number) => ({
  min: minimumComposerHeight,
  max: panelHeight > 0
    ? Math.max(
        minimumComposerHeight,
        Math.min(
          Math.floor(panelHeight * 0.7),
          panelHeight - conversationHeaderHeight - resizeHandleHeight - minimumConversationHeight
        )
      )
    : fallbackMaximumComposerHeight
})
