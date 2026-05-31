type CommandResult = { status: number | null; stdout: string; stderr: string }
type CommandRunner = (command: string, args: string[]) => CommandResult

type RuntimeOptions = {
    env?: NodeJS.ProcessEnv
    now?: () => number
    runner?: CommandRunner
    sleep?: (ms: number) => void
    write?: (message: string) => void
}

export type DockerRuntimeLease = {
    readonly startedColima: boolean
    dispose(): void
}

export function ensureDockerRuntime(options: RuntimeOptions = {}): DockerRuntimeLease | null {
    const env = options.env ?? process.env
    const runner = options.runner ?? runCommand
    const write = options.write ?? ((message) => console.log(message))

    if (isDockerAvailable(runner)) {
        return createLease({ env, runner, startedColima: false, write })
    }
    if (env.VIBY_PAIRING_NETEM_AUTO_COLIMA === '0') return null
    if (!isColimaAvailable(runner)) return null

    write('[harness] Docker unavailable; starting Colima for pairing netem smoke')
    const startResult = runner('colima', ['start', ...buildColimaStartArgs(env)])
    if (startResult.status !== 0) {
        throw new Error(`colima start failed\n${startResult.stderr || startResult.stdout}`)
    }

    try {
        waitForDocker({
            env,
            now: options.now ?? Date.now,
            runner,
            sleep: options.sleep ?? sleepSync,
        })
    } catch (error) {
        runner('colima', ['stop'])
        throw error
    }

    return createLease({ env, runner, startedColima: true, write })
}

function createLease(options: {
    env: NodeJS.ProcessEnv
    runner: CommandRunner
    startedColima: boolean
    write: (message: string) => void
}): DockerRuntimeLease {
    return {
        startedColima: options.startedColima,
        dispose: () => {
            if (!options.startedColima || options.env.VIBY_PAIRING_NETEM_KEEP_COLIMA === '1') return
            options.write('[harness] stopping Colima started by pairing netem smoke')
            options.runner('colima', ['stop'])
        },
    }
}

function waitForDocker(options: {
    env: NodeJS.ProcessEnv
    now: () => number
    runner: CommandRunner
    sleep: (ms: number) => void
}): void {
    const timeoutMs = parsePositiveInt(options.env.VIBY_PAIRING_NETEM_DOCKER_WAIT_MS, 120_000)
    const startedAt = options.now()
    while (options.now() - startedAt < timeoutMs) {
        if (isDockerAvailable(options.runner)) return
        options.sleep(1_000)
    }
    throw new Error(`Docker daemon did not become ready within ${timeoutMs}ms after starting Colima`)
}

function isDockerAvailable(runner: CommandRunner): boolean {
    return runner('docker', ['info']).status === 0
}

function isColimaAvailable(runner: CommandRunner): boolean {
    return runner('colima', ['version']).status === 0
}

function buildColimaStartArgs(env: NodeJS.ProcessEnv): string[] {
    const args: string[] = []
    if (env.VIBY_COLIMA_PROFILE) args.push('--profile', env.VIBY_COLIMA_PROFILE)
    return args
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function runCommand(command: string, args: string[]): CommandResult {
    try {
        const result = Bun.spawnSync([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
        return {
            status: result.exitCode,
            stdout: result.stdout.toString(),
            stderr: result.stderr.toString(),
        }
    } catch (error) {
        return { status: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
    }
}

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
