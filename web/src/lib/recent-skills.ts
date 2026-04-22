import { type RecentSkillsMap, readRecentSkillsMap } from '@/lib/recentSkillsStorage'

export function getRecentSkills(): RecentSkillsMap {
    return readRecentSkillsMap()
}
