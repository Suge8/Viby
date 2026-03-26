import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildOptionalDependencies } from './npmReleaseConfig';

const SCRIPT_DIR = import.meta.dir;
const CLI_ROOT = join(SCRIPT_DIR, '..');
const REPO_ROOT = join(CLI_ROOT, '..');
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function assertVersionFormat(version: string): void {
    if (!SEMVER_PATTERN.test(version)) {
        throw new Error(`Invalid semver version: ${version}`);
    }
}

function replaceFirstVersionField(content: string, version: string): string {
    return content.replace(
        /("version"\s*:\s*")[^"]+(")/,
        `$1${version}$2`
    );
}

function syncPackageJsonVersion(filePath: string, version: string): void {
    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, replaceFirstVersionField(content, version));
}

function replaceOptionalDependencyVersion(
    content: string,
    packageName: string,
    version: string
): string {
    const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`("${escapedName}"\\s*:\\s*")[^"]+(")`);
    return content.replace(pattern, `$1${version}$2`);
}

function syncCliPackageVersion(version: string): void {
    const filePath = join(CLI_ROOT, 'package.json');
    let content = readFileSync(filePath, 'utf-8');

    content = replaceFirstVersionField(content, version);

    for (const [packageName] of Object.entries(buildOptionalDependencies(version))) {
        content = replaceOptionalDependencyVersion(content, packageName, version);
    }

    writeFileSync(filePath, content);
}

function syncTauriConfigVersion(version: string): void {
    const filePath = join(REPO_ROOT, 'desktop', 'src-tauri', 'tauri.conf.json');
    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, replaceFirstVersionField(content, version));
}

function syncCargoTomlVersion(version: string): void {
    const filePath = join(REPO_ROOT, 'desktop', 'src-tauri', 'Cargo.toml');
    const content = readFileSync(filePath, 'utf-8');
    const nextContent = content.replace(
        /^version = "[^"]+"$/m,
        `version = "${version}"`
    );

    writeFileSync(filePath, nextContent);
}

export function syncWorkspaceVersion(version: string): void {
    assertVersionFormat(version);
    syncCliPackageVersion(version);
    syncPackageJsonVersion(join(REPO_ROOT, 'hub', 'package.json'), version);
    syncPackageJsonVersion(join(REPO_ROOT, 'web', 'package.json'), version);
    syncPackageJsonVersion(join(REPO_ROOT, 'shared', 'package.json'), version);
    syncPackageJsonVersion(join(REPO_ROOT, 'desktop', 'package.json'), version);
    syncTauriConfigVersion(version);
    syncCargoTomlVersion(version);
}
