import { QuestUpdateDTO } from '../models/quest.model';
import { QuestGroupOutputDTO } from '../models/quest-group.model';
import { ThemeOutputDTO } from '../models/theme.model';
import { getStatusOrder, PENDING_STATUS_ORDER } from '../services/quest.service';
import { QuestStatusKind } from '../components/status-hex-icon/status-hex-icon.component';

export type QuestSortMode = 'dateAdded' | 'status' | 'group' | 'theme';

// Sentinel keys for the "doesn't belong to any real group/theme" bucket - shared with the map's
// group/theme visibility filter (see map.component.ts) so both places agree on the same id for an
// ungrouped/unthemed quest instead of each hand-rolling their own string.
export const NO_GROUP_KEY = '__no_group__';
export const NO_THEME_KEY = '__no_theme__';

export type QuestCategory = {
  key: string;
  label: string;
  icon: { kind: 'status'; status: QuestStatusKind } | { kind: 'theme'; color: string } | null;
  quests: QuestUpdateDTO[];
};

function createdAtMs(quest: QuestUpdateDTO): number {
  const ms = quest.createdAt ? new Date(quest.createdAt).getTime() : NaN;
  return Number.isNaN(ms) ? -Infinity : ms;
}

// Newest-first; malformed/missing timestamps sort as oldest rather than corrupting the order.
export function sortQuestsByDateAdded(quests: QuestUpdateDTO[]): QuestUpdateDTO[] {
  return [...quests].sort((a, b) => createdAtMs(b) - createdAtMs(a));
}

function byStatusThenDate(a: QuestUpdateDTO, b: QuestUpdateDTO): number {
  const statusDiff = getStatusOrder(a.statusId) - getStatusOrder(b.statusId);
  return statusDiff !== 0 ? statusDiff : createdAtMs(b) - createdAtMs(a);
}

export function categorizeQuestsByStatus(quests: QuestUpdateDTO[]): QuestCategory[] {
  return PENDING_STATUS_ORDER.map(status => ({
    key: status.id,
    label: status.label,
    icon: { kind: 'status' as const, status: status.kind },
    quests: quests.filter(q => q.statusId === status.id).sort((a, b) => createdAtMs(b) - createdAtMs(a)),
  })).filter(category => category.quests.length > 0);
}

export function categorizeQuestsByGroup(quests: QuestUpdateDTO[], groups: QuestGroupOutputDTO[]): QuestCategory[] {
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  const categories: QuestCategory[] = sortedGroups.map(group => ({
    key: group.id,
    label: group.name,
    icon: null,
    quests: quests.filter(q => q.questGroupId === group.id).sort(byStatusThenDate),
  }));

  const groupIds = new Set(groups.map(g => g.id));
  const ungrouped = quests.filter(q => !q.questGroupId || !groupIds.has(q.questGroupId)).sort(byStatusThenDate);
  if (ungrouped.length > 0) {
    categories.push({ key: NO_GROUP_KEY, label: 'Sans groupe', icon: null, quests: ungrouped });
  }

  return categories.filter(category => category.quests.length > 0);
}

function byPrimaryThenStatusThenDate(a: QuestUpdateDTO, b: QuestUpdateDTO): number {
  const primaryDiff = (b.isPrimaryTheme ? 1 : 0) - (a.isPrimaryTheme ? 1 : 0);
  if (primaryDiff !== 0) return primaryDiff;
  return byStatusThenDate(a, b);
}

export function categorizeQuestsByTheme(quests: QuestUpdateDTO[], themes: ThemeOutputDTO[]): QuestCategory[] {
  const sortedThemes = [...themes].sort((a, b) => a.name.localeCompare(b.name));
  const categories: QuestCategory[] = sortedThemes.map(theme => ({
    key: theme.id,
    label: theme.name,
    icon: { kind: 'theme' as const, color: theme.color },
    quests: quests.filter(q => q.themeId === theme.id).sort(byPrimaryThenStatusThenDate),
  }));

  const themeIds = new Set(themes.map(t => t.id));
  const unthemed = quests.filter(q => !q.themeId || !themeIds.has(q.themeId)).sort(byStatusThenDate);
  if (unthemed.length > 0) {
    categories.push({ key: NO_THEME_KEY, label: 'Sans thème', icon: null, quests: unthemed });
  }

  return categories.filter(category => category.quests.length > 0);
}

export function categorizeQuests(
  quests: QuestUpdateDTO[],
  mode: Exclude<QuestSortMode, 'dateAdded'>,
  groups: QuestGroupOutputDTO[],
  themes: ThemeOutputDTO[]
): QuestCategory[] {
  switch (mode) {
    case 'status':
      return categorizeQuestsByStatus(quests);
    case 'group':
      return categorizeQuestsByGroup(quests, groups);
    case 'theme':
      return categorizeQuestsByTheme(quests, themes);
  }
}
