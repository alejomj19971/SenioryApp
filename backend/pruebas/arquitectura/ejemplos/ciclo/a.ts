// ROMPE: sin-ciclos (a → b → a)
import { b } from './b.js';

export const a = (): string => `a${b()}`;
