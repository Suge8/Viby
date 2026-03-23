import { describe, expect, it } from 'vitest'
import { createFileRouteSearch, getRootLabel } from '@/routes/sessions/filesPageUtils'

describe('filesPageUtils', () => {
    it('creates file route search for changes tab without staged flag', () => {
        expect(createFileRouteSearch('/tmp/test.ts', 'changes')).toEqual({
            path: 'L3RtcC90ZXN0LnRz',
        })
    })

    it('preserves staged flag and directory tab', () => {
        expect(createFileRouteSearch('/tmp/test.ts', 'directories', true)).toEqual({
            path: 'L3RtcC90ZXN0LnRz',
            staged: true,
            tab: 'directories',
        })
    })

    it('extracts root label from unix and windows paths', () => {
        expect(getRootLabel('/Users/demo/project')).toBe('project')
        expect(getRootLabel('C:\\Users\\demo\\repo')).toBe('repo')
    })
})
