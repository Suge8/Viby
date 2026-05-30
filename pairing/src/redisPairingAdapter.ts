import type { RedisClientType } from 'redis'
import type { RedisPairingAdapter } from './storeTypes'

interface RedisClientCommands {
    ping(): Promise<unknown>
    get(key: string): Promise<string | null>
    set(key: string, value: string, options?: { EX: number }): Promise<unknown>
    del(key: string): Promise<unknown>
    expire?(key: string, seconds: number): Promise<unknown>
    hGetAll?(key: string): Promise<Record<string, string>>
    hSet?(key: string, field: string, value: string): Promise<unknown>
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

    async expire(key: string, ttlSeconds: number): Promise<void> {
        if ('expire' in this.client && this.client.expire) await this.client.expire(key, ttlSeconds)
        else await this.client.sendCommand(['EXPIRE', key, String(ttlSeconds)])
    }

    async hgetall(key: string): Promise<Record<string, string>> {
        if ('hGetAll' in this.client && this.client.hGetAll) return await this.client.hGetAll(key)
        const values = await this.client.sendCommand<string[]>(['HGETALL', key])
        const entries = Array.from({ length: values.length / 2 }, (_, index) => [
            values[index * 2] ?? '',
            values[index * 2 + 1] ?? '',
        ])
        return Object.fromEntries(entries)
    }

    async hset(key: string, field: string, value: string): Promise<void> {
        if ('hSet' in this.client && this.client.hSet) await this.client.hSet(key, field, value)
        else await this.client.sendCommand(['HSET', key, field, value])
    }

    async compareAndSet(
        key: string,
        expected: string | null,
        next: string | null,
        options?: { ttlSeconds?: number }
    ): Promise<boolean> {
        const result = await this.eval<number>(
            COMPARE_AND_SET_SCRIPT,
            [key],
            [
                expected === null ? 'null' : 'value',
                expected ?? '',
                next === null ? 'null' : 'value',
                next ?? '',
                String(options?.ttlSeconds ?? 0),
            ]
        )
        return result === 1
    }

    async eval<T>(script: string, keys: readonly string[], args: readonly string[]): Promise<T> {
        return await this.client.sendCommand<T>(['EVAL', script, String(keys.length), ...keys, ...args])
    }
}
