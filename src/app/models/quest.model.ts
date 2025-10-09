export type QuestCreateDTO = {
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  priorityId: string;
};

export type QuestUpdateDTO = {
  id: string;
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  priorityId: string;
  hexAssignmentId?: string;
  advancement?: number;
};
export type QuestOutputDTO = {
  id: string;
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  priorityId: string;
  hexAssignmentId?: string;
  advancement: number;
};

export const DEFAULT_ESTIMATED_TIME = 0;
