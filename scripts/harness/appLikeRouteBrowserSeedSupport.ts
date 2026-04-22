import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getJson, postJson } from './browserIsolatedAppSupport'
import { type StoredTranscriptSeedInput, seedStoredSessionMessages } from './transcriptSeedSupport'

export const DEFAULT_SESSION_FILE_PATH = 'README.md'
export const DEFAULT_SESSION_EXTRA_FILE_PATH = 'notes/todo.txt'

type SeededSessionResponse = {
    session: {
        id: string
    }
}

type AuthResponse = {
    token: string
}

type RuntimeResponse = {
    runtime: {
        id: string
        active: boolean
    } | null
}

export type PreparedWorkspace = {
    rootPath: string
    filePath: string
}

export type SeededSessions = {
    alphaSessionId: string
    betaSessionId: string
    alphaWorkspace: PreparedWorkspace
}

export async function seedRuntimeAndSessions(options: {
    alphaPrefillStoredMessages?: readonly StoredTranscriptSeedInput[]
    alphaSessionName: string
    alphaPrefillMessages?: readonly string[]
    betaSessionName: string
    cliApiToken: string
    driver?: string
    hubUrl: string
    outputDir: string
    runtimeId: string
    sessionExtraFilePath?: string
    sessionFilePath?: string
    vibyHomeDir: string
}): Promise<SeededSessions> {
    const sessionFilePath = options.sessionFilePath ?? DEFAULT_SESSION_FILE_PATH
    const sessionExtraFilePath = options.sessionExtraFilePath ?? DEFAULT_SESSION_EXTRA_FILE_PATH
    const auth = await postJson<AuthResponse>(`${options.hubUrl}/api/auth`, {
        body: { accessToken: options.cliApiToken },
    })
    const existingRuntime = await getJson<RuntimeResponse>(`${options.hubUrl}/api/runtime`, {
        headers: { authorization: `Bearer ${auth.token}` },
    })
    const runtimeId = existingRuntime.runtime?.active ? existingRuntime.runtime.id : await registerSmokeRuntime(options)

    const alphaWorkspace = prepareWorkspace({
        name: options.alphaSessionName,
        outputDir: options.outputDir,
        sessionExtraFilePath,
        sessionFilePath,
        tag: 'app-like-route-alpha',
    })
    const betaWorkspace = prepareWorkspace({
        name: options.betaSessionName,
        outputDir: options.outputDir,
        sessionExtraFilePath,
        sessionFilePath,
        tag: 'app-like-route-beta',
    })

    const sessionIds: string[] = []
    for (const [tag, name, workspace] of [
        ['app-like-route-alpha', options.alphaSessionName, alphaWorkspace],
        ['app-like-route-beta', options.betaSessionName, betaWorkspace],
    ] as const) {
        const response = await postJson<SeededSessionResponse>(`${options.hubUrl}/cli/sessions`, {
            headers: { authorization: `Bearer ${options.cliApiToken}` },
            body: {
                tag,
                metadata: {
                    driver: options.driver,
                    name,
                    host: 'smoke.local',
                    path: workspace.rootPath,
                    machineId: runtimeId,
                },
            },
        })
        sessionIds.push(response.session.id)
    }

    const alphaSessionId = sessionIds[0] ?? ''
    if (alphaSessionId && options.alphaPrefillStoredMessages && options.alphaPrefillStoredMessages.length > 0) {
        seedStoredSessionMessages({
            dbPath: join(options.vibyHomeDir, 'viby.db'),
            sessionId: alphaSessionId,
            messages: options.alphaPrefillStoredMessages,
        })
    } else if (alphaSessionId && options.alphaPrefillMessages && options.alphaPrefillMessages.length > 0) {
        await prefillSessionMessages({
            authToken: auth.token,
            hubUrl: options.hubUrl,
            messages: options.alphaPrefillMessages,
            sessionId: alphaSessionId,
        })
    }

    return {
        alphaSessionId,
        betaSessionId: sessionIds[1] ?? '',
        alphaWorkspace,
    }
}

async function registerSmokeRuntime(
    options: Pick<Parameters<typeof seedRuntimeAndSessions>[0], 'cliApiToken' | 'hubUrl' | 'runtimeId' | 'vibyHomeDir'>
): Promise<string> {
    await postJson(`${options.hubUrl}/cli/machines`, {
        headers: { authorization: `Bearer ${options.cliApiToken}` },
        body: {
            id: options.runtimeId,
            metadata: {
                displayName: 'Smoke Runtime',
                host: 'smoke.local',
                platform: 'darwin',
                homeDir: homedir(),
                vibyHomeDir: options.vibyHomeDir,
            },
        },
    })

    return options.runtimeId
}

function prepareWorkspace(options: {
    name: string
    outputDir: string
    sessionExtraFilePath: string
    sessionFilePath: string
    tag: string
}): PreparedWorkspace {
    const rootPath = join(options.outputDir, 'workspaces', options.tag)
    mkdirSync(join(rootPath, 'notes'), { recursive: true })
    writeFileSync(join(rootPath, options.sessionFilePath), `# ${options.name}\n\nInitial smoke content.\n`)
    writeFileSync(join(rootPath, options.sessionExtraFilePath), `- verify app-like route evidence\n`)
    execFileSync('git', ['init'], { cwd: rootPath, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'smoke@viby.local'], { cwd: rootPath, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Viby Smoke'], { cwd: rootPath, stdio: 'ignore' })
    execFileSync('git', ['add', '.'], { cwd: rootPath, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'Initial smoke seed'], { cwd: rootPath, stdio: 'ignore' })
    writeFileSync(
        join(rootPath, options.sessionFilePath),
        `# ${options.name}\n\nInitial smoke content.\n\nUpdated for route smoke.\n`
    )

    return {
        rootPath,
        filePath: options.sessionFilePath,
    }
}

async function prefillSessionMessages(options: {
    authToken: string
    hubUrl: string
    messages: readonly string[]
    sessionId: string
}): Promise<void> {
    for (const [index, text] of options.messages.entries()) {
        await postJson(`${options.hubUrl}/api/sessions/${options.sessionId}/messages`, {
            headers: { authorization: `Bearer ${options.authToken}` },
            body: {
                text,
                localId: `app-like-prefill-${index}`,
            },
        })
    }
}
