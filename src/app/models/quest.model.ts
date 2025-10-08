export type QuestCreateDTO = {
  title: string;
  description?: string;
  estimatedTime: number;
  isDone: boolean;
  isAssigned: boolean;
};

export type Quest = QuestCreateDTO & {
  id: number;
};

export const DEFAULT_ESTIMATED_TIME = 0;
