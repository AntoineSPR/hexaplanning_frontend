export type QuestCreateDTO = {
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
};

export type QuestUpdateDTO = {
  id: string;
  createdAt: string;
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  themeId?: string;
  isPrimaryTheme?: boolean;
  hexAssignmentId?: string;
  advancement?: number;
  questGroupId?: string;
};
export type QuestOutputDTO = {
  id: string;
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  themeId?: string;
  isPrimaryTheme?: boolean;
  hexAssignmentId?: string;
  advancement: number;
  questGroupId?: string;
};

export const DEFAULT_ESTIMATED_TIME = 0;
