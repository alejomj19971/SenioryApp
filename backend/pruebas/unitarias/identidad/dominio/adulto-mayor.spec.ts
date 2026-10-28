import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  AdultoMayor,
  EDAD_MAXIMA,
} from '../../../../src/identidad/dominio/adulto-mayor.js';
import { NombrePersona } from '../../../../src/identidad/dominio/nombre-persona.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import { AHORA, HOY, idDePrueba } from '../../../soporte/identidad.js';

const fecha = (texto: string) => FechaCivil.desdeTexto(texto);

function registrar(nacimiento: string, hoy: FechaCivil = HOY) {
  return AdultoMayor.registrar({
    id: idDePrueba(),
    nombre: NombrePersona.crear('Carmen Gómez'),
    fechaDeNacimiento: fecha(nacimiento),
    creadoPor: idDePrueba(),
    hoy,
    ahora: AHORA,
  });
}

describe('AdultoMayor', () => {
  describe('registrar', () => {
    it('crea a la persona sin cuenta propia ni foto, a nombre de quien la registra', () => {
      const creadoPor = idDePrueba<'Usuario'>();
      const id = idDePrueba<'AdultoMayor'>();

      const carmen = AdultoMayor.registrar({
        id,
        nombre: NombrePersona.crear('  Carmen   Gómez '),
        fechaDeNacimiento: fecha('1948-03-15'),
        creadoPor,
        hoy: HOY,
        ahora: AHORA,
      });

      expect(carmen).toMatchObject({
        id,
        creadoPor,
        usuarioId: null,
        fotoUrl: null,
        creadoEn: AHORA,
        actualizadoEn: AHORA,
      });
      expect(carmen.nombre.valor).toBe('Carmen Gómez');
      expect(carmen.fechaDeNacimiento.aTexto()).toBe('1948-03-15');
    });

    it('acepta a alguien que nació ayer: no se exige una edad mínima', () => {
      expect(() => registrar('2026-10-20')).not.toThrow();
    });

    it.each([
      ['hoy', '2026-10-21'],
      ['mañana', '2026-10-22'],
      ['dentro de un año', '2027-10-21'],
    ])('rechaza una fecha de nacimiento de %s', (_caso, nacimiento) => {
      expect(() => registrar(nacimiento)).toThrow(
        expect.objectContaining({
          codigo: 'adulto_mayor.fecha_de_nacimiento_invalida',
        }),
      );
    });

    it('acepta 120 años cumplidos y rechaza más', () => {
      expect(EDAD_MAXIMA).toBe(120);
      expect(() => registrar('1906-10-21')).not.toThrow(); // cumple 120 hoy
      expect(() => registrar('1905-10-21')).toThrow(
        expect.objectContaining({ codigo: 'adulto_mayor.edad_invalida' }),
      );
      expect(() => registrar('1900-01-01')).toThrow(
        expect.objectContaining({ codigo: 'adulto_mayor.edad_invalida' }),
      );
    });

    it('el día antes de cumplir 121 todavía es válido', () => {
      expect(() => registrar('1905-10-22')).not.toThrow(); // cumple 121 mañana: hoy tiene 120
    });
  });

  describe('edadEn', () => {
    it('es la edad en años cumplidos: el día antes del cumpleaños y el día del cumpleaños', () => {
      const carmen = registrar('1948-10-22');

      expect(carmen.edadEn(fecha('2026-10-21'))).toBe(77);
      expect(carmen.edadEn(fecha('2026-10-22'))).toBe(78);
      expect(carmen.edadEn(fecha('2026-10-23'))).toBe(78);
    });

    it('con el reloj fijado: el cumpleaños llega a medianoche en Bogotá, no en UTC', () => {
      const carmen = registrar('1948-10-22');
      const reloj = new RelojFalso('2026-10-22T04:59:59.999Z'); // 11:59 p. m. del 21 en Bogotá

      expect(carmen.edadEn(FechaCivil.hoy(reloj, 'America/Bogota'))).toBe(77);
      reloj.avanzar(1); // medianoche en Bogotá
      expect(carmen.edadEn(FechaCivil.hoy(reloj, 'America/Bogota'))).toBe(78);
    });

    it('quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos', () => {
      const bisiesta = registrar('1948-02-29');

      expect(bisiesta.edadEn(fecha('2026-02-28'))).toBe(77);
      expect(bisiesta.edadEn(fecha('2026-03-01'))).toBe(78);
      expect(bisiesta.edadEn(fecha('2028-02-28'))).toBe(79);
      expect(bisiesta.edadEn(fecha('2028-02-29'))).toBe(80);
    });

    it('no se guarda: cambia sola con la fecha', () => {
      const carmen = registrar('1948-03-15');

      expect(carmen.edadEn(fecha('2026-03-14'))).toBe(77);
      expect(carmen.edadEn(fecha('2026-03-15'))).toBe(78);
      expect(carmen.edadEn(fecha('2027-03-15'))).toBe(79);
    });
  });
});
