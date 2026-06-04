import { execFileSync } from 'node:child_process'

const tauriCommand = process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
const args = ['build']

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    args.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }))
    console.log('[desktop] TAURI_SIGNING_PRIVATE_KEY missing; building local app bundle without updater artifacts.')
}

execFileSync(tauriCommand, args, { stdio: 'inherit' })
