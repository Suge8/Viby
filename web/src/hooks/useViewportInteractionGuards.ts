import { useEffect } from 'react'

function preventDefault(event: Event): void {
    event.preventDefault()
}

function shouldPreventZoomShortcut(event: KeyboardEvent): boolean {
    const modifierPressed = event.ctrlKey || event.metaKey
    if (!modifierPressed) {
        return false
    }

    return event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0'
}

export function useViewportInteractionGuards(): void {
    useEffect(() => {
        function handleWheel(event: WheelEvent): void {
            if (event.ctrlKey) {
                event.preventDefault()
            }
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (shouldPreventZoomShortcut(event)) {
                event.preventDefault()
            }
        }

        document.addEventListener('gesturestart', preventDefault as EventListener, { passive: false })
        document.addEventListener('gesturechange', preventDefault as EventListener, { passive: false })
        document.addEventListener('gestureend', preventDefault as EventListener, { passive: false })
        window.addEventListener('wheel', handleWheel, { passive: false })
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('gesturestart', preventDefault as EventListener)
            document.removeEventListener('gesturechange', preventDefault as EventListener)
            document.removeEventListener('gestureend', preventDefault as EventListener)
            window.removeEventListener('wheel', handleWheel)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])
}
