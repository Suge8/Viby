import { describe, expect, it } from 'bun:test'
import { sep } from 'node:path'
import { debugDesktopBinaryPath } from './desktopDevLifecycle'

describe('desktop dev lifecycle smoke helpers', () => {
    it('targets the Tauri debug Desktop binary that tauri dev rebuilds', () => {
        const path = debugDesktopBinaryPath()
        const suffix =
            process.platform === 'win32' ? `${sep}target${sep}debug${sep}viby.exe` : `${sep}target${sep}debug${sep}viby`

        expect(path.endsWith(suffix)).toBe(true)
        expect(path.includes(`${sep}desktop${sep}src-tauri${sep}`)).toBe(true)
    })
})
