const IME_IN_PROGRESS_FALLBACK_CODE = 229

export type ImeKeyboardEventSnapshot = {
    isComposing?: boolean
    keyCode?: number
}

type ImeKeyboardState = {
    isComposing: boolean
    nativeEvent?: ImeKeyboardEventSnapshot | null
}

export function hasImeInProgressFallbackCode(keyCode: number | null | undefined): boolean {
    return keyCode === IME_IN_PROGRESS_FALLBACK_CODE
}

export function isImeKeyboardCompositionActive(state: ImeKeyboardState): boolean {
    return (
        state.isComposing ||
        state.nativeEvent?.isComposing === true ||
        hasImeInProgressFallbackCode(state.nativeEvent?.keyCode)
    )
}
