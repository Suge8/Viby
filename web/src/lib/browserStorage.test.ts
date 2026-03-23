import { afterEach, describe, expect, it } from 'vitest'
import {
    readBrowserStorageItem,
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'

describe('browserStorage', () => {
    afterEach(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
    })

    it('writes and reads JSON values from the requested storage host', () => {
        writeBrowserStorageJson('local', 'viby:test-local', { value: 'local' })
        writeBrowserStorageJson('session', 'viby:test-session', { value: 'session' })

        expect(readBrowserStorageItem('local', 'viby:test-local')).toBe(JSON.stringify({ value: 'local' }))
        expect(readBrowserStorageItem('session', 'viby:test-session')).toBe(JSON.stringify({ value: 'session' }))
    })

    it('removes invalid JSON records by default', () => {
        window.localStorage.setItem('viby:test-invalid', 'not-json')

        const value = readBrowserStorageJson({
            storage: 'local',
            key: 'viby:test-invalid',
            parse: () => null
        })

        expect(value).toBeNull()
        expect(window.localStorage.getItem('viby:test-invalid')).toBeNull()
    })

    it('can keep invalid values when cleanup is explicitly disabled', () => {
        window.sessionStorage.setItem('viby:test-keep-invalid', 'bad-value')

        const value = readBrowserStorageJson({
            storage: 'session',
            key: 'viby:test-keep-invalid',
            parse: () => null,
            removeInvalid: false
        })

        expect(value).toBeNull()
        expect(window.sessionStorage.getItem('viby:test-keep-invalid')).toBe('bad-value')

        removeBrowserStorageItem('session', 'viby:test-keep-invalid')
        expect(window.sessionStorage.getItem('viby:test-keep-invalid')).toBeNull()
    })
})
