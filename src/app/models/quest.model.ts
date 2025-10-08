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
};
export type QuestOutputDTO = {
  id: string;
  title: string;
  description?: string;
  estimatedTime: number;
  statusId: string;
  priorityId: string;
  hexAssignmentId?: string;
};

export const DEFAULT_ESTIMATED_TIME = 0;
