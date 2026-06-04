import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildWebBuildMetadata, WEB_BUILD_METADATA_FILE_NAME } from '@viby/protocol'

const require = createRequire(import.meta.url)
const DIST_DIR = resolve(import.meta.dir, '..', 'dist')
const appVersion = require('../../app-core/package.json').version as string
const buildId = process.env.VIBY_APP_BUILD_ID || appVersion

const metadata = buildWebBuildMetadata({ appVersion, buildId })

await mkdir(DIST_DIR, { recursive: true })
await writeFile(resolve(DIST_DIR, WEB_BUILD_METADATA_FILE_NAME), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
console.log(`[build] wrote ${WEB_BUILD_METADATA_FILE_NAME}: ${metadata.buildId}`)
