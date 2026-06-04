import { access, readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { parse as parseYaml } from 'yaml'

export interface SkillSummary {
    name: string
    description?: string
}

type SkillDiscovery = {
    skills: SkillSummary[]
    watchRoots: string[]
}

function getHomeDirectory(): string {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir()
}

function getUserSkillsRoots(): string[] {
    const home = getHomeDirectory()
    return [join(home, '.agents', 'skills'), join(home, '.claude', 'skills'), join(home, '.codex', 'skills')]
}

function getAdminSkillsRoot(): string {
    return join('/etc', 'codex', 'skills')
}

function getProjectSkillsRoots(directory: string): string[] {
    return [
        join(directory, '.agents', 'skills'),
        join(directory, '.claude', 'skills'),
        join(directory, '.codex', 'skills'),
    ]
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

function isVisibleDirectoryName(name: string): boolean {
    return !name.startsWith('.')
}

function dedupeStrings(values: readonly string[]): string[] {
    return [...new Set(values.map((value) => resolve(value)))]
}

async function listProjectSkillsRoots(workingDirectory?: string): Promise<string[]> {
    if (!workingDirectory) {
        return []
    }

    const resolvedWorkingDirectory = resolve(workingDirectory)
    const directories = [resolvedWorkingDirectory]
    let currentDirectory = resolvedWorkingDirectory

    while (true) {
        if (await pathExists(join(currentDirectory, '.git'))) {
            return directories.flatMap(getProjectSkillsRoots)
        }

        const parentDirectory = dirname(currentDirectory)
        if (parentDirectory === currentDirectory) {
            return getProjectSkillsRoots(resolvedWorkingDirectory)
        }

        currentDirectory = parentDirectory
        directories.push(currentDirectory)
    }
}

function parseFrontmatter(fileContent: string): { frontmatter?: Record<string, unknown>; body: string } {
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
        return { body: fileContent.trim() }
    }

    const yamlContent = match[1]
    const body = match[2].trim()
    try {
        const parsed = parseYaml(yamlContent) as Record<string, unknown> | null
        return { frontmatter: parsed ?? undefined, body }
    } catch {
        return { body: fileContent.trim() }
    }
}

function extractSkillSummary(skillDir: string, fileContent: string): SkillSummary | null {
    const parsed = parseFrontmatter(fileContent)
    const nameFromFrontmatter = typeof parsed.frontmatter?.name === 'string' ? parsed.frontmatter.name.trim() : ''
    const name = nameFromFrontmatter || basename(skillDir)
    if (!name) {
        return null
    }

    const description =
        typeof parsed.frontmatter?.description === 'string' ? parsed.frontmatter.description.trim() : undefined

    return { name, description }
}

async function readSkillsFromDirs(skillDirs: string[]): Promise<SkillSummary[]> {
    const skills = await Promise.all(
        skillDirs.map(async (dir): Promise<SkillSummary | null> => {
            const filePath = join(dir, 'SKILL.md')
            try {
                const fileContent = await readFile(filePath, 'utf-8')
                return extractSkillSummary(dir, fileContent)
            } catch {
                return null
            }
        })
    )

    return skills.filter((skill): skill is SkillSummary => skill !== null)
}

async function discoverSkillsInRoot(skillsRoot: string): Promise<SkillDiscovery> {
    const resolvedRoot = resolve(skillsRoot)
    const watchRoots: string[] = [resolvedRoot]

    try {
        const entries = await readdir(resolvedRoot, { withFileTypes: true })
        const nestedDiscoveries = await Promise.all(
            entries
                .filter((entry) => entry.isDirectory() && isVisibleDirectoryName(entry.name))
                .map(async (entry) => {
                    const entryPath = join(resolvedRoot, entry.name)
                    const skillFilePath = join(entryPath, 'SKILL.md')
                    if (await pathExists(skillFilePath)) {
                        return {
                            skills: await readSkillsFromDirs([entryPath]),
                            watchRoots: [entryPath],
                        } satisfies SkillDiscovery
                    }

                    return await discoverSkillsInRoot(entryPath)
                })
        )

        return {
            skills: nestedDiscoveries.flatMap((discovery) => discovery.skills),
            watchRoots: dedupeStrings([
                resolvedRoot,
                ...nestedDiscoveries.flatMap((discovery) => discovery.watchRoots),
            ]),
        }
    } catch {
        return {
            skills: [],
            watchRoots,
        }
    }
}

export async function discoverSkills(workingDirectory?: string): Promise<SkillDiscovery> {
    const projectRoots = await listProjectSkillsRoots(workingDirectory)
    const orderedRoots = [...projectRoots, ...getUserSkillsRoots(), getAdminSkillsRoot()]
    const discoveries = await Promise.all(orderedRoots.map(async (root) => await discoverSkillsInRoot(root)))

    const dedupedSkills = new Map<string, SkillSummary>()
    for (const discovery of discoveries) {
        for (const skill of discovery.skills) {
            if (!dedupedSkills.has(skill.name)) {
                dedupedSkills.set(skill.name, skill)
            }
        }
    }

    return {
        skills: [...dedupedSkills.values()].sort((a, b) => a.name.localeCompare(b.name)),
        watchRoots: dedupeStrings(discoveries.flatMap((discovery) => discovery.watchRoots)),
    }
}

export async function listSkills(workingDirectory?: string): Promise<SkillSummary[]> {
    return (await discoverSkills(workingDirectory)).skills
}

export async function listSkillWatchRoots(workingDirectory?: string): Promise<string[]> {
    return (await discoverSkills(workingDirectory)).watchRoots
}
