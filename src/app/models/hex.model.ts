import { QuestUpdateDTO } from './quest.model';

export type Hex = {
  q: number;
  r: number;
  s: number;
  cx: number;
  cy: number;
  level: number;
  quest?: QuestUpdateDTO;
};
