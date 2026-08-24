export type QuestGroupCreateDTO = {
  name: string;
  color: string;
  questIds: string[];
};

export type QuestGroupUpdateDTO = {
  id: string;
  name: string;
  color: string;
};

export type QuestGroupOutputDTO = {
  id: string;
  name: string;
  color: string;
  questIds: string[];
};
