export type ResultNumberMode = 'Small' | 'Medium' | 'Hero';

export interface ResultNumberPreset {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
}

export const RESULT_NUMBER_PRESETS: Record<ResultNumberMode, ResultNumberPreset> = {
  Small: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 48,
  },
  Medium: {
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    fontSize: 90,
  },
  Hero: {
    fontFamily: 'Abril Fatface',
    fontWeight: 400,
    fontSize: 200,
  }
};

export const NEXT_RESULT_MODE: Record<ResultNumberMode, ResultNumberMode> = {
  Small: 'Medium',
  Medium: 'Hero',
  Hero: 'Small',
};
