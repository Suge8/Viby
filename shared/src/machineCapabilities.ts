export const MACHINE_CAPABILITIES = [
    'browse-directory'
] as const

export type MachineCapability = (typeof MACHINE_CAPABILITIES)[number]

export const MACHINE_BROWSE_DIRECTORY_CAPABILITY: MachineCapability = 'browse-directory'

export function machineSupportsBrowseDirectory(
    capabilities: readonly string[] | null | undefined
): boolean {
    return Array.isArray(capabilities) && capabilities.includes(MACHINE_BROWSE_DIRECTORY_CAPABILITY)
}
