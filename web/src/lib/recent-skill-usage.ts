const MAX_RECENT_SKILLS = 200

import { readRecentSkillsMap, writeRecentSkillsMap } from '@/lib/recentSkillsStorage'

export function markSkillUsed(skillName: string): void {
    const name = skillName.trim()
    if (!name) {
        return
    }

    const recent = readRecentSkillsMap()
    recent[name] = Date.now()

    const entries = Object.entries(recent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_RECENT_SKILLS)

    writeRecentSkillsMap(Object.fromEntries(entries))
}
