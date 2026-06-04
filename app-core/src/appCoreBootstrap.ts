// Internal Desktop AppCore binary entry.
// Release builds expose no user command-line entry: no args starts AppCore; only AppCore-owned
// child roles can enter the internal runtime bootstrap during migration.

process.env.DEV = 'false'

const APP_CORE_COMMAND = 'hub'
const command = process.argv[2]

if (!command || command === APP_CORE_COMMAND) {
    const { runHubProcess } = await import('../../hub/src/runtime/runProcess')
    const { createAppCoreRuntimeController } = await import('./runtime/RuntimeSupervisor')
    await runHubProcess({ createLocalRuntimeController: createAppCoreRuntimeController })
} else {
    const { runInternalRuntimeCommand } = await import('./internalRuntimeBootstrap')
    await runInternalRuntimeCommand(process.argv.slice(2))
}

export {}
