export type ThemeCreateDTO = {
  name: string;
  color: string;
};

export type ThemeUpdateDTO = {
  id: string;
  name: string;
  color: string;
};

export type ThemeOutputDTO = {
  id: string;
  name: string;
  color: string;
  questIds: string[];
};
