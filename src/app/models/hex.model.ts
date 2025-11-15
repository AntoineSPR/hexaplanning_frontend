import { QuestUpdateDTO } from './quest.model';

export type Hex = {
  q: number;
  r: number;
  s: number;
  cx: number;
  cy: number;
  level: number;
  quest?: QuestUpdateDTO;
  isInitial?: boolean; // True for the original 7 hexes, false/undefined for dynamically added
};
