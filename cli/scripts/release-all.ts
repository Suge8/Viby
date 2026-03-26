#!/usr/bin/env bun
/**
 * Unified release script that handles the complete release flow:
 * 1. Sync workspace versions
 * 2. Build binaries (with embedded web assets)
 * 3. Publish platform packages first (so lockfile can resolve them)
 * 4. Publish main package
 * 5. bun install (to get complete lockfile with published packages)
 * 6. Git commit + tag + push
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    MAIN_PACKAGE_NAME,
    OFFICIAL_NPM_REGISTRY,
    getPlatformPackageName,
    PLATFORM_RELEASE_TARGETS,
    resolveDistTag,
} from './npmReleaseConfig';
import { syncWorkspaceVersion } from './versionFiles';

const scriptDir = import.meta.dir;
const projectRoot = join(scriptDir, '..');
const repoRoot = join(projectRoot, '..');
const RELEASE_MANAGED_FILES = [
    'cli/package.json',
    'hub/package.json',
    'web/package.json',
    'shared/package.json',
    'desktop/package.json',
    'desktop/src-tauri/tauri.conf.json',
    'desktop/src-tauri/Cargo.toml',
    'bun.lock',
] as const;

// 解析参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const publishNpm = args.includes('--publish-npm');  // 只发布 npm，跳过 git 操作
const skipBuild = args.includes('--skip-build');    // 跳过构建（二进制已存在）

function readVersionArgument(): string {
    const parsedVersion = args.find(arg => !arg.startsWith('--'));

    if (!parsedVersion) {
        console.error('Usage: bun run scripts/release-all.ts <version> [options]');
        console.error('Options:');
        console.error('  --dry-run      Preview the release process');
        console.error('  --publish-npm  Only publish to npm, skip git operations');
        console.error('  --skip-build   Skip building binaries (use existing)');
        console.error('Example: bun run scripts/release-all.ts 0.1.0');
        process.exit(1);
    }

    return parsedVersion;
}

const version = readVersionArgument();

function run(cmd: string, cwd = projectRoot): void {
    console.log(`\n$ ${cmd}`);
    if (!dryRun) {
        execSync(cmd, { cwd, stdio: 'inherit' });
    }
}

function getExecErrorText(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const execError = error as Error & {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
    };

    const stdout = execError.stdout ? String(execError.stdout) : '';
    const stderr = execError.stderr ? String(execError.stderr) : '';
    return `${stdout}\n${stderr}\n${execError.message}`;
}

function runWithTimeout(cmd: string, cwd = projectRoot, timeoutMs = 60_000): void {
    console.log(`\n$ ${cmd}`);
    if (dryRun) {
        return;
    }

    execSync(cmd, {
        cwd,
        stdio: 'inherit',
        timeout: timeoutMs,
    });
}

async function runWithRetry(cmd: string, cwd = projectRoot, timeoutMs = 60_000): Promise<void> {
    while (true) {
        try {
            runWithTimeout(cmd, cwd, timeoutMs);
            return;
        } catch {
            console.warn(`⚠️ ${cmd} failed or timed out. Retrying in 60s...`);
            await new Promise(resolve => setTimeout(resolve, 60_000));
        }
    }
}

function assertReleaseManagedFilesClean(): void {
    const diffOutput = execSync(
        `git status --short -- ${RELEASE_MANAGED_FILES.join(' ')}`,
        { encoding: 'utf-8', cwd: repoRoot }
    ).trim();

    if (!diffOutput) {
        return;
    }

    console.error('❌ Release-managed files already have local changes:');
    console.error(diffOutput);
    console.error('   Resolve or stash those release files before running release-all.');
    process.exit(1);
}

function publishIfNeeded(packageName: string, packageDir: string, distTag: 'latest' | 'next'): void {
    try {
        execSync(
            `npm view "${packageName}@${version}" version --registry=${OFFICIAL_NPM_REGISTRY}`,
            { cwd: repoRoot, stdio: 'ignore' }
        );
        console.log(`   ↷ Skipping ${packageName}@${version}; already published`);
        return;
    } catch {
        // Fall through to publish attempt.
    }

    const publishCmd = `npm publish --access public --tag ${distTag} --registry ${OFFICIAL_NPM_REGISTRY}${dryRun ? ' --dry-run' : ''}`;
    console.log(`\n$ ${publishCmd}`);

    if (dryRun) {
        return;
    }

    try {
        const output = execSync(publishCmd, {
            cwd: packageDir,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        process.stdout.write(output);
    } catch (error) {
        const message = getExecErrorText(error);
        process.stdout.write(message);

        if (message.includes('previously published versions')) {
            console.log(`   ↷ Skipping ${packageName}@${version}; npm reports this version already exists`);
            return;
        }

        throw error;
    }
}

async function main(): Promise<void> {
    const flags = [dryRun && 'dry-run', publishNpm && 'publish-npm', skipBuild && 'skip-build'].filter(Boolean);
    const distTag = resolveDistTag(version);
    console.log(`\n🚀 Starting release v${version}${flags.length ? ` (${flags.join(', ')})` : ''}\n`);

    // Pre-check: Ensure we're on main branch
    console.log('🔍 Pre-checks...');
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8', cwd: repoRoot }).trim();
    if (currentBranch !== 'main') {
        console.error(`❌ Release must be run from main branch (current: ${currentBranch})`);
        process.exit(1);
    }
    console.log('   ✓ On main branch');

    assertReleaseManagedFilesClean();
    console.log('   ✓ Release-managed files are clean');

    // Pre-check: Ensure npm is logged in (skip in dry-run mode)
    if (!dryRun) {
        try {
            const npmUser = execSync(`npm whoami --registry=${OFFICIAL_NPM_REGISTRY}`, { encoding: 'utf-8' }).trim();
            console.log(`   ✓ Logged in to npm as: ${npmUser}`);
        } catch {
            console.error('❌ Not logged in to npm. Run `npm login` first.');
            process.exit(1);
        }
    } else {
        console.log('   ✓ Skipping npm login check (dry-run)');
    }

    // Step 1: Sync workspace versions
    console.log('📦 Step 1: Syncing workspace versions...');
    const pkgPath = join(projectRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    const oldVersion = pkg.version;
    if (!dryRun) {
        syncWorkspaceVersion(version);
    }
    console.log(`   ${oldVersion} → ${version}`);

    // Step 2: Build all platform binaries (with embedded web assets)
    if (!skipBuild) {
        console.log('\n🔨 Step 2: Building all platform binaries with web assets...');
        run('bun run build:single-exe:all', repoRoot);
    } else {
        console.log('\n🔨 Step 2: Skipping build (--skip-build)');
    }

    // Step 3: Prepare and publish platform packages
    console.log(`\n📤 Step 3: Publishing platform packages (${distTag})...`);
    run('bun run prepare-npm-packages');
    for (const platform of PLATFORM_RELEASE_TARGETS) {
        const npmDir = join(projectRoot, 'npm', platform.packagePlatform);
        publishIfNeeded(getPlatformPackageName(platform.packagePlatform), npmDir, distTag);
    }

    // Step 4: Publish main package
    console.log(`\n📤 Step 4: Publishing main package (${distTag})...`);
    const mainNpmDir = join(projectRoot, 'npm', 'main');
    publishIfNeeded(MAIN_PACKAGE_NAME, mainNpmDir, distTag);

    // --publish-npm 模式到此结束
    if (publishNpm) {
        console.log(`\n✅ Published v${version} to npm!`);
        return;
    }

    // Step 5: bun install to get complete lockfile
    console.log('\n📥 Step 5: Updating lockfile...');

    await runWithRetry('bun install', repoRoot);
    // Step 6: Git commit + tag + push
    console.log('\n📝 Step 6: Creating git commit and tag...');
    run(`git add ${RELEASE_MANAGED_FILES.join(' ')}`, repoRoot);
    run(`git commit -m "🔖 bump version to ${version}"`, repoRoot);
    run(`git tag v${version}`, repoRoot);
    run(`git push && git push --tags`, repoRoot);

    console.log(`\n✅ Release v${version} completed!`);
}

main().catch(err => {
    console.error('Release failed:', err);
    process.exit(1);
});
