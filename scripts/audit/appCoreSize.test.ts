import { describe, expect, it } from 'bun:test'
import { collectPackageSizes } from './appCoreSize'

describe('app core size report helpers', () => {
    it('groups Bun metafile inputs by real package names', () => {
        const sizes = collectPackageSizes(
            {
                inputs: {
                    '../node_modules/.bun/zod@4/node_modules/zod/index.js': { bytes: 100 },
                    '../node_modules/.bun/zod@4/node_modules/zod/core.js': { bytes: 50 },
                    '../node_modules/.bun/@scope+pkg@1/node_modules/@scope/pkg/index.js': { bytes: 30 },
                    'src/local.ts': { bytes: 999 },
                },
            },
            3
        )

        expect(sizes).toEqual([
            { packageName: 'zod', bytes: 150 },
            { packageName: '@scope/pkg', bytes: 30 },
        ])
    })
})
