import { isPermissionModeAllowedForFlavor } from '@viby/protocol';
import { PermissionModeSchema } from '@viby/protocol/schemas';
import type { AgentFlavor, SessionPermissionMode } from '@/api/types';

export function resolvePermissionModeForFlavor(
  value: unknown,
  flavor: AgentFlavor
): SessionPermissionMode {
  const parsed = PermissionModeSchema.safeParse(value);
  if (!parsed.success || !isPermissionModeAllowedForFlavor(parsed.data, flavor)) {
    throw new Error('Invalid permission mode');
  }

  return parsed.data;
}

export function assertSessionConfigPayload(
  payload: unknown
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid session config payload');
  }

  return payload as Record<string, unknown>;
}
