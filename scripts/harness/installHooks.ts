import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const hookNames = ['pre-commit', 'pre-push']

function installHook(name: string): void {
    const sourcePath = join(repoRoot, '.githooks', name)
    const targetDir = join(repoRoot, '.git', 'hooks')
    const targetPath = join(targetDir, name)

    if (!existsSync(sourcePath)) {
        throw new Error(`Missing hook template: ${sourcePath}`)
    }

    mkdirSync(targetDir, { recursive: true })
    copyFileSync(sourcePath, targetPath)
    chmodSync(targetPath, 0o755)
    console.log(`[harness] installed git hook: ${name}`)
}

for (const hookName of hookNames) {
    installHook(hookName)
}
