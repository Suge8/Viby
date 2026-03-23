import { z } from 'zod'

export const MACHINE_DIRECTORY_ROOT_KINDS = [
    'home',
    'desktop',
    'documents',
    'downloads',
    'projects',
    'code',
    'workspace'
] as const

export const MachineDirectoryRootKindSchema = z.enum(MACHINE_DIRECTORY_ROOT_KINDS)
export type MachineDirectoryRootKind = z.infer<typeof MachineDirectoryRootKindSchema>

export const MachineDirectoryEntrySchema = z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['directory'])
})

export type MachineDirectoryEntry = z.infer<typeof MachineDirectoryEntrySchema>

export const MachineDirectoryRootSchema = z.object({
    kind: MachineDirectoryRootKindSchema,
    path: z.string()
})

export type MachineDirectoryRoot = z.infer<typeof MachineDirectoryRootSchema>

export const MachineDirectoryResponseSchema = z.object({
    success: z.boolean(),
    currentPath: z.string().optional(),
    parentPath: z.string().nullable().optional(),
    entries: z.array(MachineDirectoryEntrySchema).optional(),
    roots: z.array(MachineDirectoryRootSchema).optional(),
    error: z.string().optional()
})

export type MachineDirectoryResponse = z.infer<typeof MachineDirectoryResponseSchema>
