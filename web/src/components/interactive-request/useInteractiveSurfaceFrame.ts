import type { RefObject } from 'react'
import { type ElementFrame, useElementFrame } from '@/hooks/useElementFrame'

export type InteractiveSurfaceFrame = ElementFrame

export function useInteractiveSurfaceFrame(targetRef: RefObject<HTMLElement | null>): InteractiveSurfaceFrame | null {
    return useElementFrame(targetRef)
}
