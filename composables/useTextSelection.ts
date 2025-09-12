export interface SelectionInfo {
    selectedText: string
    position: { x: number; y: number }
    element: HTMLElement | null
    range?: Range
}

export function useTextSelection() {
    const isQuickChatVisible = ref(false)
    const selectedContent = ref('')
    const dialogPosition = ref({ x: 0, y: 0 })
    const savedRange = ref<Range | null>(null)
    const highlightOverlay = ref<HTMLElement | null>(null)

    // Track if quick chat is available (can be controlled externally)
    const isEnabled = ref(true)

    const showQuickChat = (selectionInfo: SelectionInfo) => {
        if (!isEnabled.value) return

        selectedContent.value = selectionInfo.selectedText
        dialogPosition.value = selectionInfo.position
        savedRange.value = selectionInfo.range || null

        // Create visual highlight overlay to persist selection appearance
        createHighlightOverlay()

        isQuickChatVisible.value = true
    }

    const hideQuickChat = (clearSelection = true) => {
        // Remove highlight overlay
        removeHighlightOverlay()

        // Clear the saved selection only if requested
        if (clearSelection && savedRange.value) {
            const selection = window.getSelection()
            if (selection) {
                selection.removeAllRanges()
            }
            savedRange.value = null
        }

        isQuickChatVisible.value = false
        selectedContent.value = ''
    }

    const restoreSelection = () => {
        if (savedRange.value) {
            const selection = window.getSelection()
            if (selection) {
                selection.removeAllRanges()

                try {
                    // Create a new range from the saved range to avoid DOM issues
                    const newRange = document.createRange()
                    newRange.setStart(savedRange.value.startContainer, savedRange.value.startOffset)
                    newRange.setEnd(savedRange.value.endContainer, savedRange.value.endOffset)
                    selection.addRange(newRange)
                } catch (e) {
                    console.warn('Failed to restore selection:', e)
                }
            }
        }
    }

    const handleSelection = () => {
        if (!isEnabled.value) return

        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
            return null
        }

        const selectedText = selection.toString().trim()
        if (!selectedText || selectedText.length < 3) {
            return null
        }

        // Get the position of the selection
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        // Position the dialog slightly below and to the right of the selection
        const position = {
            x: rect.right + 10,
            y: rect.bottom + 10
        }

        // Ensure the dialog stays within viewport bounds
        const maxX = window.innerWidth - 340 // dialog width (320) + padding
        const maxY = window.innerHeight - 300 // approximate compact dialog height + padding

        if (position.x > maxX) {
            position.x = Math.max(10, rect.left - 330) // Show to the left instead
        }

        if (position.y > maxY) {
            position.y = Math.max(10, rect.top - 280) // Show above instead
        }

        return {
            selectedText,
            position,
            element: range.commonAncestorContainer.parentElement,
            range: range.cloneRange() // Clone the range to preserve it
        }
    }

    const setupSelectionHandler = (container?: HTMLElement) => {
        const targetElement = container || document

        const handleMouseUp = (event: MouseEvent) => {
            // Small delay to ensure selection is finalized
            setTimeout(() => {
                const selectionInfo = handleSelection()
                if (selectionInfo) {
                    showQuickChat(selectionInfo)
                }
            }, 50)
        }

        const handleKeyUp = (event: KeyboardEvent) => {
            // Handle keyboard selection (Shift + Arrow keys, Ctrl+A, etc.)
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
                setTimeout(() => {
                    const selectionInfo = handleSelection()
                    if (selectionInfo) {
                        showQuickChat(selectionInfo)
                    }
                }, 50)
            }

            // Hide quick chat on Escape
            if (event.key === 'Escape') {
                hideQuickChat()
            }
        }

        // Add event listeners
        targetElement.addEventListener('mouseup', handleMouseUp)
        targetElement.addEventListener('keyup', handleKeyUp)

        // Return cleanup function
        return () => {
            targetElement.removeEventListener('mouseup', handleMouseUp)
            targetElement.removeEventListener('keyup', handleKeyUp)
        }
    }

    const enable = () => {
        isEnabled.value = true
    }

    const disable = () => {
        isEnabled.value = false
        hideQuickChat()
    }

    // Create visual highlight overlay to maintain selection appearance
    const createHighlightOverlay = () => {
        if (!savedRange.value) return

        try {
            // Remove any existing overlay
            removeHighlightOverlay()

            // Create highlight elements for each range rectangle
            const rects = savedRange.value.getClientRects()
            const overlayContainer = document.createElement('div')
            overlayContainer.className = 'text-selection-overlay-container'
            overlayContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1;
            `

            // Detect dark mode
            const isDarkMode = document.documentElement.classList.contains('dark') ||
                window.matchMedia('(prefers-color-scheme: dark)').matches

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i]
                const highlight = document.createElement('div')
                highlight.className = 'text-selection-highlight'

                // Use different colors for light and dark mode
                const backgroundColor = isDarkMode
                    ? 'rgba(147, 197, 253, 0.3)' // Light blue for dark mode
                    : 'rgba(59, 130, 246, 0.25)'  // Blue for light mode

                highlight.style.cssText = `
                    position: absolute;
                    background-color: ${backgroundColor};
                    top: ${rect.top + window.scrollY}px;
                    left: ${rect.left + window.scrollX}px;
                    width: ${rect.width}px;
                    height: ${rect.height}px;
                    pointer-events: none;
                `
                overlayContainer.appendChild(highlight)
            }

            document.body.appendChild(overlayContainer)
            highlightOverlay.value = overlayContainer
        } catch (error) {
            console.warn('Failed to create highlight overlay:', error)
        }
    }

    const removeHighlightOverlay = () => {
        if (highlightOverlay.value) {
            try {
                document.body.removeChild(highlightOverlay.value)
            } catch (error) {
                // Element might already be removed
            }
            highlightOverlay.value = null
        }
    }

    // Cleanup function for when component unmounts
    const cleanup = () => {
        removeHighlightOverlay()
        hideQuickChat(false) // Don't clear selection on cleanup
    }

    // Auto-cleanup on page unload
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', cleanup)
    }

    return {
        isQuickChatVisible,
        selectedContent,
        dialogPosition,
        isEnabled: readonly(isEnabled),
        showQuickChat,
        hideQuickChat,
        handleSelection,
        setupSelectionHandler,
        restoreSelection,
        enable,
        disable,
        cleanup
    }
}
