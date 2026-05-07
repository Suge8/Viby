import { type Config, DotLottie, type LoadErrorEvent } from '@lottiefiles/dotlottie-web'
import { type JSX, useEffect, useRef } from 'react'

type LottiePlayerProps = {
    active?: boolean
    className?: string
    label: string
    src: string
}

type PlayerState = {
    animation: DotLottie
    settled: boolean
}

const DESTROY_FALLBACK_MS = 4_000
const REDUCED_MOTION_FRAME = 32
const RENDER_QUALITY = 88

function prefersReducedMotion(): boolean {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function reportAnimationError(error: Error): void {
    if (typeof globalThis.reportError === 'function') {
        globalThis.reportError(error)
        return
    }
    setTimeout(() => {
        throw error
    }, 0)
}

function syncPlayback(state: PlayerState, active: boolean): void {
    if (prefersReducedMotion()) {
        state.animation.setFrame(REDUCED_MOTION_FRAME)
        state.animation.pause()
        return
    }
    if (active) state.animation.play()
    else state.animation.pause()
}

function deferDestroy(state: PlayerState, removeListeners: () => void): void {
    let done = false
    let timeoutId: number | null = null

    const cleanup = (): void => {
        removeListeners()
        state.animation.removeEventListener('load', destroy)
        state.animation.removeEventListener('loadError', destroy)
        if (timeoutId !== null) window.clearTimeout(timeoutId)
    }

    const destroy = (): void => {
        if (done) return
        done = true
        cleanup()
        window.setTimeout(() => state.animation.destroy(), 0)
    }

    removeListeners()
    state.animation.pause()
    if (state.settled) {
        destroy()
        return
    }
    state.animation.addEventListener('load', destroy)
    state.animation.addEventListener('loadError', destroy)
    timeoutId = window.setTimeout(destroy, DESTROY_FALLBACK_MS)
}

function buildOptions(canvas: HTMLCanvasElement, src: string, active: boolean): Config {
    return {
        autoplay: active && !prefersReducedMotion(),
        backgroundColor: 'transparent',
        canvas,
        layout: { fit: 'contain', align: [0.5, 0.5] },
        loop: true,
        renderConfig: { autoResize: true, freezeOnOffscreen: false, quality: RENDER_QUALITY },
        src,
        useFrameInterpolation: true,
    }
}

export function LottiePlayer(props: LottiePlayerProps): JSX.Element {
    const activeRef = useRef(props.active ?? true)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const playerRef = useRef<PlayerState | null>(null)

    useEffect(() => {
        activeRef.current = props.active ?? true
        if (playerRef.current) syncPlayback(playerRef.current, activeRef.current)
    }, [props.active])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        let disposed = false
        let removeListeners = () => undefined
        const frameId = window.requestAnimationFrame(() => {
            if (disposed) return
            const state: PlayerState = {
                animation: new DotLottie(buildOptions(canvas, props.src, activeRef.current)),
                settled: false,
            }
            const handleLoad = (): void => {
                state.settled = true
                syncPlayback(state, activeRef.current)
            }
            const handleLoadError = (event: LoadErrorEvent): void => {
                state.settled = true
                if (!disposed) reportAnimationError(event.error)
            }

            removeListeners = () => {
                state.animation.removeEventListener('load', handleLoad)
                state.animation.removeEventListener('loadError', handleLoadError)
            }
            state.animation.addEventListener('load', handleLoad)
            state.animation.addEventListener('loadError', handleLoadError)
            playerRef.current = state
        })

        return () => {
            disposed = true
            window.cancelAnimationFrame(frameId)
            const state = playerRef.current
            playerRef.current = null
            if (state) deferDestroy(state, removeListeners)
        }
    }, [props.src])

    return <canvas ref={canvasRef} className={props.className} role="img" aria-label={props.label} />
}
