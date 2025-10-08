export type QuestCreateDTO = {
  title: string;
  description?: string;
  estimatedTime: number;
  isDone: boolean;
  isAssigned: boolean;
};

export type QuestUpdateDTO = {
  id: string;
  title: string;
  description?: string;
  estimatedTime: number;
  isDone: boolean;
  isAssigned: boolean;
};

export const DEFAULT_ESTIMATED_TIME = 0;
