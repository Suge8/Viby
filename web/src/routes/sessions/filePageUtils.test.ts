import { describe, expect, it } from 'vitest'
import {
    decodeFilePath,
    extractCommandError,
    getPreferredFileDisplayMode,
    getUtf8ByteLength,
    isBinaryContent,
    resolveActiveFileDisplayMode,
    resolveFileLanguage,
    shouldLoadFileContent,
} from '@/routes/sessions/filePageUtils'

describe('filePageUtils', () => {
    it('decodes encoded file paths and falls back to raw value', () => {
        expect(decodeFilePath('L3RtcC90ZXN0LnRz')).toBe('/tmp/test.ts')
        expect(decodeFilePath('not-base64')).toBe('not-base64')
    })

    it('resolves file language aliases', () => {
        expect(resolveFileLanguage('index.ts')).toBe('typescript')
        expect(resolveFileLanguage('Dockerfile')).toBeUndefined()
        expect(resolveFileLanguage('script.sh')).toBe('shellscript')
    })

    it('uses the files tab as the single preferred display mode source', () => {
        expect(getPreferredFileDisplayMode(undefined)).toBe('diff')
        expect(getPreferredFileDisplayMode('changes')).toBe('diff')
        expect(getPreferredFileDisplayMode('directories')).toBe('file')
    })

    it('falls back to file mode when diff content is unavailable', () => {
        expect(resolveActiveFileDisplayMode({
            hasDiffContent: false,
            preferredDisplayMode: 'diff',
        })).toBe('file')

        expect(resolveActiveFileDisplayMode({
            hasDiffContent: true,
            preferredDisplayMode: 'file',
        })).toBe('file')
    })

    it('detects binary content and counts utf8 bytes', () => {
        expect(isBinaryContent('hello world')).toBe(false)
        expect(isBinaryContent('abc\u0000def')).toBe(true)
        expect(getUtf8ByteLength('你好')).toBe(6)
    })

    it('extracts command errors from git responses', () => {
        expect(extractCommandError(undefined)).toBeNull()
        expect(extractCommandError({ success: true, stdout: '' })).toBeNull()
        expect(extractCommandError({ success: false, stderr: 'boom' })).toBe('boom')
    })

    it('only loads file content when the route actually needs it', () => {
        expect(shouldLoadFileContent({
            displayMode: 'diff',
            diffResolution: 'pending',
            diffCommandFailed: false,
            hasDiffContent: false,
        })).toBe(false)

        expect(shouldLoadFileContent({
            displayMode: 'diff',
            diffResolution: 'ready',
            diffCommandFailed: false,
            hasDiffContent: true,
        })).toBe(false)

        expect(shouldLoadFileContent({
            displayMode: 'file',
            diffResolution: 'ready',
            diffCommandFailed: false,
            hasDiffContent: true,
        })).toBe(true)

        expect(shouldLoadFileContent({
            displayMode: 'diff',
            diffResolution: 'ready',
            diffCommandFailed: true,
            hasDiffContent: false,
        })).toBe(true)
    })
})
