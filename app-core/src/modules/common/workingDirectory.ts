export type WorkingDirectoryProvider = () => string

export function toWorkingDirectoryProvider(
    workingDirectory: string | WorkingDirectoryProvider
): WorkingDirectoryProvider {
    return typeof workingDirectory === 'function' ? workingDirectory : () => workingDirectory
}
