import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGeminiLocalConfig, resolveGeminiRuntimeConfig } from './config'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-gemini-config-'))
    tempDirs.push(path)
    return path
}

function writeProjectGeminiEnv(project: string, content: string): void {
    const geminiDir = join(project, '.gemini')
    mkdirSync(geminiDir, { recursive: true })
    writeFileSync(join(geminiDir, '.env'), content)
}

afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true })
    }
})

describe('Gemini runtime config', () => {
    it('loads project .gemini/.env as Gemini-specific env over generic project .env', () => {
        process.env.GEMINI_CLI_HOME = makeTempDir()
        const project = makeTempDir()
        writeFileSync(join(project, '.env'), 'GEMINI_MODEL=gemini-2.5-flash\nGEMINI_API_KEY=plain-key\n')
        writeProjectGeminiEnv(project, 'GEMINI_MODEL=gemini-3-pro-preview\n')

        expect(resolveGeminiRuntimeConfig({ cwd: join(project, 'src') })).toMatchObject({
            model: 'gemini-3-pro-preview',
            token: 'plain-key',
            modelSource: 'env',
        })
    })

    it('loads user .gemini/.env from GEMINI_CLI_HOME when project env is absent', () => {
        const geminiHome = makeTempDir()
        process.env.GEMINI_CLI_HOME = geminiHome
        mkdirSync(join(geminiHome, '.gemini'), { recursive: true })
        writeFileSync(join(geminiHome, '.gemini', '.env'), 'GOOGLE_API_KEY=home-key\n')

        expect(readGeminiLocalConfig(makeTempDir()).env.GOOGLE_API_KEY).toBe('home-key')
        expect(resolveGeminiRuntimeConfig({ cwd: makeTempDir() }).token).toBe('home-key')
    })

    it('keeps project .env above user .gemini/.env when project-specific .gemini/.env is absent', () => {
        const geminiHome = makeTempDir()
        process.env.GEMINI_CLI_HOME = geminiHome
        mkdirSync(join(geminiHome, '.gemini'), { recursive: true })
        writeFileSync(join(geminiHome, '.gemini', '.env'), 'GEMINI_MODEL=gemini-2.5-flash\n')
        const project = makeTempDir()
        writeFileSync(join(project, '.env'), 'GEMINI_MODEL=gemini-3-pro-preview\n')

        expect(resolveGeminiRuntimeConfig({ cwd: project })).toMatchObject({
            model: 'gemini-3-pro-preview',
            modelSource: 'env',
        })
    })

    it('ignores empty explicit and process env values before falling back to settings', () => {
        process.env.GEMINI_CLI_HOME = makeTempDir()
        process.env.GEMINI_MODEL = '   '
        process.env.GEMINI_API_KEY = ''
        const project = makeTempDir()
        const geminiDir = join(project, '.gemini')
        mkdirSync(geminiDir, { recursive: true })
        writeFileSync(join(geminiDir, 'settings.json'), JSON.stringify({ model: 'gemini-2.5-pro' }))

        expect(resolveGeminiRuntimeConfig({ model: '  ', token: ' ', cwd: project })).toMatchObject({
            model: 'gemini-2.5-pro',
            modelSource: 'local',
        })
    })
})
