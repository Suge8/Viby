import type { RedisClientType } from 'redis'
import type { RedisPairingAdapter } from './storeTypes'

interface RedisClientCommands {
    ping(): Promise<unknown>
    get(key: string): Promise<string | null>
    set(key: string, value: string, options?: { EX: number }): Promise<unknown>
    del(key: string): Promise<unknown>
    sendCommand<T>(args: readonly string[]): Promise<T>
}

const COMPARE_AND_SET_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if ARGV[1] == 'null' then
  if current ~= false then
    return 0
  end
elseif current ~= ARGV[2] then
  return 0
end

if ARGV[3] == 'null' then
  redis.call('DEL', KEYS[1])
elseif tonumber(ARGV[5]) > 0 then
  redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[5])
else
  redis.call('SET', KEYS[1], ARGV[4])
end

return 1
`.trim()

export class RedisClientPairingAdapter implements RedisPairingAdapter {
    constructor(private readonly client: RedisClientCommands | RedisClientType) {}

    async ping(): Promise<void> {
        await this.client.ping()
    }

    async get(key: string): Promise<string | null> {
        return await this.client.get(key)
    }

    async set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void> {
        if (options?.ttlSeconds) {
            await this.client.set(key, value, { EX: options.ttlSeconds })
            return
        }

        await this.client.set(key, value)
    }

    async del(key: string): Promise<void> {
        await this.client.del(key)
    }

    async compareAndSet(
        key: string,
        expected: string | null,
        next: string | null,
        options?: { ttlSeconds?: number }
    ): Promise<boolean> {
        const result = await this.client.sendCommand<number>([
            'EVAL',
            COMPARE_AND_SET_SCRIPT,
            '1',
            key,
            expected === null ? 'null' : 'value',
            expected ?? '',
            next === null ? 'null' : 'value',
            next ?? '',
            String(options?.ttlSeconds ?? 0),
        ])
        return result === 1
    }
}
