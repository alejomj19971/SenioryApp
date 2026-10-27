// ROMPE: sin-ciclos (b → a → b)
import { a } from './a.js';

export const b = (): string => (Math.random() > 2 ? a() : 'b');
