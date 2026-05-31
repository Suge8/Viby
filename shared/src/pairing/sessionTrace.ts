import { z } from 'zod'

export const SESSION_TRACE_SCHEMA_VERSION = 1

export const SessionTracePeerRoleSchema = z.enum(['broker', 'desktop', 'phone'])
export type SessionTracePeerRole = z.infer<typeof SessionTracePeerRoleSchema>

export const SessionTraceEventNameSchema = z.enum([
    'session.create',
    'session.verify',
    'ws.open',
    'ws.close',
    'peer.attach',
    'peer.detach',
    'tunnel.open',
    'tunnel.frame-drop',
    'pwa.handoff-issue',
    'pwa.handoff-consume',
    'route.event',
    'route.transition',
    'ice.restart',
    'channel.open',
    'channel.close',
    'heartbeat.ack',
    'heartbeat.missed',
    'getstats.opaque',
    'foreground.pulse',
    'relay.reconnect',
    'rpc.failure',
    'fatal',
])
export type SessionTraceEventName = z.infer<typeof SessionTraceEventNameSchema>

const TracePrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type SessionTracePrimitive = z.infer<typeof TracePrimitiveSchema>

export const SessionTraceRouteTransitionSchema = z.object({
    fromPhase: z.string().nullable(),
    fromRoute: z.string().nullable(),
    toPhase: z.string().nullable(),
    toRoute: z.string().nullable(),
    reason: z.string().nullable().optional(),
    routeRevision: z.number().int().nonnegative().optional(),
})
export type SessionTraceRouteTransition = z.infer<typeof SessionTraceRouteTransitionSchema>

export const SessionTraceEventRecordSchema = z.object({
    pairingId: z.string().min(1),
    sessionId: z.string().min(1).nullable(),
    peerRole: SessionTracePeerRoleSchema,
    seq: z.number().int().nonnegative(),
    monotonicMs: z.number().finite().nonnegative(),
    wallMs: z.number().int().nonnegative(),
    event: SessionTraceEventNameSchema,
    routeTransition: SessionTraceRouteTransitionSchema.optional(),
    payloadMeta: z.record(z.string(), TracePrimitiveSchema).default({}),
})
export type SessionTraceEventRecord = z.infer<typeof SessionTraceEventRecordSchema>

export const SessionTraceBundleSchema = z.object({
    schemaVersion: z.literal(SESSION_TRACE_SCHEMA_VERSION),
    pairingId: z.string().min(1),
    capturedAt: z.number().int().nonnegative(),
    events: z.array(SessionTraceEventRecordSchema),
})
export type SessionTraceBundle = z.infer<typeof SessionTraceBundleSchema>
