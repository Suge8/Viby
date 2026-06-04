import { describe, expect, it } from 'bun:test'

import { buildHealthCheckScript } from '../../pairing/scripts/deployBundleTemplates'

describe('pairing deploy templates', () => {
    it('waits for broker health endpoints after a service restart', () => {
        const script = buildHealthCheckScript()

        expect(script).toContain('PAIRING_HEALTH_CHECK_ATTEMPTS')
        expect(script).toContain('health_attempts="${PAIRING_HEALTH_CHECK_ATTEMPTS:-10}"')
        expect(script).toContain('PAIRING_HEALTH_CHECK_DELAY_SECONDS')
        expect(script).toContain('wait_for_ready "local readiness endpoint is unavailable" "$local_base/ready" 3')
        expect(script).toContain('wait_for_ready "public readiness endpoint is unavailable" "$public_base/ready" 5')
        expect(script).toContain('wait_for_metrics "$local_base/metrics"')
        expect(script).not.toContain('curl -fsS --max-time 3 "$local_base/ready" >/dev/null || fail')
    })
})
