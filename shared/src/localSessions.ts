import { z } from 'zod'
import { SessionDriverSchema } from './schemas'

export const LocalSessionCapabilitySchema = z.object({
    driver: SessionDriverSchema,
    supported: z.boolean(),
    reason: z.string().optional(),
})

export type LocalSessionCapability = z.infer<typeof LocalSessionCapabilitySchema>

export const LocalSessionTranscriptMessageSchema = z.object({
    role: z.enum(['user', 'agent']),
    text: z.string(),
    createdAt: z.number(),
})

export type LocalSessionTranscriptMessage = z.infer<typeof LocalSessionTranscriptMessageSchema>

export const LocalSessionCatalogEntrySchema = z.object({
    driver: SessionDriverSchema,
    providerSessionId: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    path: z.string(),
    startedAt: z.number(),
    updatedAt: z.number(),
    messageCount: z.number().int().nonnegative().optional(),
})

export type LocalSessionCatalogEntry = z.infer<typeof LocalSessionCatalogEntrySchema>

export const LocalSessionCatalogRequestSchema = z.object({
    path: z.string().min(1),
    driver: SessionDriverSchema,
})

export type LocalSessionCatalogRequest = z.infer<typeof LocalSessionCatalogRequestSchema>

export const LocalSessionCatalogSchema = z.object({
    capabilities: z.array(LocalSessionCapabilitySchema),
    sessions: z.array(LocalSessionCatalogEntrySchema),
})

export type LocalSessionCatalog = z.infer<typeof LocalSessionCatalogSchema>

export const LocalSessionExportRequestSchema = LocalSessionCatalogRequestSchema.extend({
    providerSessionId: z.string().min(1),
})

export type LocalSessionExportRequest = z.infer<typeof LocalSessionExportRequestSchema>

export const LocalSessionExportSnapshotSchema = LocalSessionCatalogEntrySchema.extend({
    messages: z.array(LocalSessionTranscriptMessageSchema),
})

export type LocalSessionExportSnapshot = z.infer<typeof LocalSessionExportSnapshotSchema>
