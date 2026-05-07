import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()
const brandLogoCandidates = [
    join(moduleDir, 'brand-logo-tight.png'),
    join(cwd, 'brand-logo-tight.png'),
    join(cwd, 'web/public/brand-logo-tight.png'),
    join(cwd, '../web/public/brand-logo-tight.png'),
] as const

let cachedBrandLogo: ArrayBuffer | null = null

export function readBrandLogoAsset(): ArrayBuffer {
    if (cachedBrandLogo) {
        return cachedBrandLogo
    }

    const sourcePath = brandLogoCandidates.find((path) => existsSync(path))
    if (!sourcePath) {
        throw new Error('Missing Viby brand logo asset')
    }

    const file = readFileSync(sourcePath)
    cachedBrandLogo = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
    return cachedBrandLogo
}
