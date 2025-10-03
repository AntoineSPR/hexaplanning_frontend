export enum QuestPriority {
  PRIMARY = 'Quête principale',
  SECONDARY = 'Quête secondaire',
  TERTIARY = 'Quête tertiaire',
}

export enum QuestStatus {
  NOT_STARTED = 'Non commencée',
  IN_PROGRESS = 'En cours',
  COMPLETED = 'Terminée',
}

export type QuestBase = {
  title: string;
  description?: string;
  estimatedTime: number;
  priority: QuestPriority;
  status: QuestStatus;
  isDone: boolean;
  isAssigned: boolean;
};

export type Quest = QuestBase & {
  id: number;
};

export const DEFAULT_ESTIMATED_TIME = 0;
export const DEFAULT_PRIORITY: keyof typeof QuestPriority = 'TERTIARY';
