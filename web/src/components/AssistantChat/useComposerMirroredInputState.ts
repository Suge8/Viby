import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export type TextInputState = {
    text: string
    selection: { start: number; end: number }
}

const DEFAULT_INPUT_STATE: TextInputState = {
    text: '',
    selection: { start: 0, end: 0 }
}

type UseComposerMirroredInputStateResult = [
    TextInputState,
    Dispatch<SetStateAction<TextInputState>>
]

export function useComposerMirroredInputState(composerText: string): UseComposerMirroredInputStateResult {
    const [inputState, setInputState] = useState<TextInputState>(DEFAULT_INPUT_STATE)

    useEffect(() => {
        setInputState((previousState) => {
            if (previousState.text === composerText) {
                return previousState
            }

            const cursorPosition = composerText.length
            return {
                text: composerText,
                selection: { start: cursorPosition, end: cursorPosition }
            }
        })
    }, [composerText])

    return [inputState, setInputState]
}
