#!/usr/bin/env bun

import { syncWorkspaceVersion } from './versionFiles';

function readVersionArgument(): string {
    const version = process.argv[2];

    if (!version) {
        console.error('Usage: bun run scripts/sync-version.ts <version>');
        console.error('Example: bun run scripts/sync-version.ts 0.1.0');
        process.exit(1);
    }

    return version;
}

function main(): void {
    const version = readVersionArgument();
    syncWorkspaceVersion(version);
    console.log(`Synced workspace version to ${version}`);
}

main();
