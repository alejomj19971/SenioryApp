// La hora actual como dependencia: las pruebas la fijan y la avanzan sin esperar (RelojFalso).
export interface Reloj {
  ahora(): Date;
}

export const RELOJ = Symbol('Reloj');
