import { describe, expect, it } from 'vitest';
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from './providerConfig';

describe('providerConfig', () => {
  it('accepts a valid permission mode for the target flavor', () => {
    expect(resolvePermissionModeForDriver('default', 'codex')).toBe('default');
  });

  it('rejects a permission mode that the flavor does not support', () => {
    expect(() => resolvePermissionModeForDriver('plan', 'gemini')).toThrow('Invalid permission mode');
  });

  it('requires object payloads for session config handlers', () => {
    expect(() => assertSessionConfigPayload(null)).toThrow('Invalid session config payload');
    expect(assertSessionConfigPayload({ permissionMode: 'default' })).toEqual({ permissionMode: 'default' });
  });
});
