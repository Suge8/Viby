import { describe, expect, it } from 'vitest'
import { decodeFilePath, extractCommandError, getUtf8ByteLength, isBinaryContent, resolveFileLanguage } from '@/routes/sessions/filePageUtils'

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
})
