import { renderHook } from '@testing-library/react'
import type { SessionDriver } from '@viby/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useComposerInputController } from './useComposerInputController'

const setInputState = vi.fn()
const activeSuggestionsMock = vi.fn()

vi.mock('@/components/AssistantChat/useClaudeComposerModelShortcut', () => ({
    useClaudeComposerModelShortcut: () => undefined,
}))

vi.mock('@/components/AssistantChat/useComposerMirroredInputState', () => ({
    useComposerMirroredInputState: () => [{ text: '', selection: { start: 0, end: 0 } }, setInputState],
}))

vi.mock('@/hooks/useActiveWord', () => ({
    useActiveWord: () => null,
}))

vi.mock('@/hooks/useActiveSuggestions', () => ({
    useActiveSuggestions: (...args: unknown[]) => activeSuggestionsMock(...args),
}))

type ControllerOverrides = Partial<Parameters<typeof useComposerInputController>[0]> & {
    send?: ReturnType<typeof vi.fn>
}

function createControllerOptions(overrides?: ControllerOverrides): Parameters<typeof useComposerInputController>[0] {
    const send = overrides?.send ?? vi.fn()
    const {
        send: _send,
        api,
        autocompletePrefixes,
        autocompleteSuggestions,
        canSend,
        composerText,
        haptic,
        isTouch,
        model,
        onAbort,
        onModelChange,
        onPermissionModeChange,
        onSendRequest,
        onSuggestionAction,
        permissionMode,
        permissionModes,
        sessionDriver,
        threadIsRunning,
        autocompleteRefreshKey,
    } = overrides ?? {}

    return {
        api:
            api ??
            ({
                composer: () => ({
                    setText: vi.fn(),
                    send,
                    addAttachment: vi.fn(),
                }),
            } as never),
        composerText: composerText ?? '',
        canSend: canSend ?? true,
        isTouch: isTouch ?? false,
        threadIsRunning: threadIsRunning ?? false,
        permissionMode: permissionMode ?? 'default',
        permissionModes: permissionModes ?? ['default'],
        autocompletePrefixes: autocompletePrefixes ?? [],
        autocompleteSuggestions: autocompleteSuggestions ?? vi.fn(async () => []),
        autocompleteRefreshKey,
        onSuggestionAction,
        sessionDriver: (sessionDriver ?? 'codex') as SessionDriver | null,
        model: model ?? null,
        onAbort: onAbort ?? vi.fn(),
        onPermissionModeChange,
        onModelChange,
        onSendRequest: onSendRequest ?? vi.fn(),
        haptic: haptic ?? vi.fn(),
    }
}

describe('useComposerInputController', () => {
    beforeEach(() => {
        setInputState.mockReset()
        activeSuggestionsMock.mockReset()
    })

    it('routes action suggestions through the suggestion action handler', () => {
        const setText = vi.fn()
        const onSuggestionAction = vi.fn()
        activeSuggestionsMock.mockReturnValue([
            [
                {
                    key: 'codex:builtin:new',
                    text: '/new',
                    label: '/new',
                    actionType: 'open_new_session',
                },
            ],
            0,
            vi.fn(),
            vi.fn(),
            vi.fn(),
        ])

        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    api: {
                        composer: () => ({
                            setText,
                            send: vi.fn(),
                            addAttachment: vi.fn(),
                        }),
                    } as never,
                    autocompletePrefixes: ['/'],
                    onSuggestionAction,
                })
            )
        )

        result.current.handleSuggestionSelect(0)

        expect(onSuggestionAction).toHaveBeenCalledWith(
            expect.objectContaining({
                text: '/new',
                actionType: 'open_new_session',
            })
        )
        expect(setText).not.toHaveBeenCalled()
    })

    it('tracks local input selection state without forcing a second runtime write', () => {
        const setText = vi.fn()
        activeSuggestionsMock.mockReturnValue([[], -1, vi.fn(), vi.fn(), vi.fn()])
        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    api: {
                        composer: () => ({
                            setText,
                            send: vi.fn(),
                            addAttachment: vi.fn(),
                        }),
                    } as never,
                })
            )
        )

        result.current.handleChange({
            target: {
                value: 'draft text',
                selectionStart: 10,
                selectionEnd: 10,
            },
        } as never)

        expect(setInputState).toHaveBeenCalledWith({
            text: 'draft text',
            selection: { start: 10, end: 10 },
        })
        expect(setText).not.toHaveBeenCalled()
    })

    it('disables auto-select-first so slash suggestions do not highlight the first item by default', () => {
        activeSuggestionsMock.mockReturnValue([[], -1, vi.fn(), vi.fn(), vi.fn()])

        renderHook(() => useComposerInputController(createControllerOptions({ autocompletePrefixes: ['/'] })))

        expect(activeSuggestionsMock).toHaveBeenCalledWith(
            null,
            expect.any(Function),
            expect.objectContaining({
                autoSelectFirst: false,
            })
        )
    })

    it('sends on desktop Enter and clears the resume hint through the single keyboard owner', () => {
        const send = vi.fn()
        const onSendRequest = vi.fn()
        const preventDefault = vi.fn()

        activeSuggestionsMock.mockReturnValue([[], -1, vi.fn(), vi.fn(), vi.fn()])

        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    send,
                    composerText: 'hello',
                    onSendRequest,
                })
            )
        )

        result.current.handleKeyDown({
            key: 'Enter',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            nativeEvent: { isComposing: false },
            preventDefault,
        } as never)

        expect(preventDefault).toHaveBeenCalledOnce()
        expect(send).not.toHaveBeenCalled()
        expect(onSendRequest).toHaveBeenCalledOnce()
    })

    it('keeps touch Enter on the textarea newline path so only the send button can submit', () => {
        const send = vi.fn()
        const preventDefault = vi.fn()

        activeSuggestionsMock.mockReturnValue([[], -1, vi.fn(), vi.fn(), vi.fn()])

        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    send,
                    composerText: 'hello',
                    isTouch: true,
                })
            )
        )

        result.current.handleKeyDown({
            key: 'Enter',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            nativeEvent: { isComposing: false },
            preventDefault,
        } as never)

        expect(preventDefault).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })

    it('ignores Enter when the browser reports the IME 229 fallback code', () => {
        const onSendRequest = vi.fn()
        const preventDefault = vi.fn()

        activeSuggestionsMock.mockReturnValue([[], -1, vi.fn(), vi.fn(), vi.fn()])

        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    composerText: '你好',
                    onSendRequest,
                })
            )
        )

        result.current.handleKeyDown({
            key: 'Enter',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            nativeEvent: { isComposing: false, ['key' + 'Code']: 229 },
            preventDefault,
        } as never)

        expect(preventDefault).not.toHaveBeenCalled()
        expect(onSendRequest).not.toHaveBeenCalled()
    })

    it('commits the selected suggestion before the desktop Enter send path', () => {
        const onSendRequest = vi.fn()
        const onSuggestionAction = vi.fn()
        const preventDefault = vi.fn()

        activeSuggestionsMock.mockReturnValue([
            [
                {
                    key: 'codex:builtin:new',
                    text: '/new',
                    label: '/new',
                    actionType: 'open_new_session',
                },
            ],
            0,
            vi.fn(),
            vi.fn(),
            vi.fn(),
        ])

        const { result } = renderHook(() =>
            useComposerInputController(
                createControllerOptions({
                    composerText: '/n',
                    onSendRequest,
                    onSuggestionAction,
                    autocompletePrefixes: ['/'],
                })
            )
        )

        result.current.handleKeyDown({
            key: 'Enter',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            nativeEvent: { isComposing: false },
            preventDefault,
        } as never)

        expect(preventDefault).toHaveBeenCalledOnce()
        expect(onSuggestionAction).toHaveBeenCalledOnce()
        expect(onSendRequest).not.toHaveBeenCalled()
    })
})
