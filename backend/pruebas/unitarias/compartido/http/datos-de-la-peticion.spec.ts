import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  idDeCorrelacionDe,
  ipDelClienteDe,
} from '../../../../src/compartido/http/datos-de-la-peticion.js';

const SECRETO = 'secreto-compartido-con-el-frontend-0123456789';

function peticion(
  cabeceras: Record<string, string> = {},
  ipDeLaConexion = '10.0.0.5',
): IncomingMessage {
  const minusculas = Object.fromEntries(
    Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    headers: minusculas,
    socket: { remoteAddress: ipDeLaConexion },
  } as unknown as IncomingMessage;
}

function respuesta() {
  const setHeader = vi.fn();
  return { respuesta: { setHeader } as unknown as ServerResponse, setHeader };
}

describe('idDeCorrelacionDe', () => {
  it('se calcula una sola vez por petición y se devuelve en la cabecera', () => {
    const p = peticion();
    const { respuesta: r, setHeader } = respuesta();

    const primero = idDeCorrelacionDe(p, r);
    expect(idDeCorrelacionDe(p, r)).toBe(primero);
    expect(setHeader).toHaveBeenCalledOnce();
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', primero);
  });

  it('dos peticiones distintas reciben IDs distintos', () => {
    expect(idDeCorrelacionDe(peticion(), respuesta().respuesta)).not.toBe(
      idDeCorrelacionDe(peticion(), respuesta().respuesta),
    );
  });
});

describe('ipDelClienteDe', () => {
  const delBff = (secreto: string, ip: string) =>
    peticion({ 'X-Seniory-BFF': secreto, 'X-Cliente-IP': ip });

  it('con el secreto correcto usa la IP que declara el BFF', () => {
    expect(ipDelClienteDe(delBff(SECRETO, '181.50.1.20'), SECRETO)).toBe(
      '181.50.1.20',
    );
    expect(ipDelClienteDe(delBff(SECRETO, '2800:e2:1::5'), SECRETO)).toBe(
      '2800:e2:1::5',
    );
  });

  it.each([
    ['un secreto equivocado', delBff('otro', '181.50.1.20'), SECRETO],
    [
      'un secreto que es prefijo del real',
      delBff(SECRETO.slice(0, 10), '181.50.1.20'),
      SECRETO,
    ],
    [
      'sin cabecera del BFF',
      peticion({ 'X-Cliente-IP': '181.50.1.20' }),
      SECRETO,
    ],
    [
      'una IP declarada inválida',
      delBff(SECRETO, '181.50.1.20, 1.1.1.1'),
      SECRETO,
    ],
    ['el secreto sin configurar', delBff(SECRETO, '181.50.1.20'), null],
    [
      'solo X-Forwarded-For',
      peticion({ 'X-Forwarded-For': '181.50.1.20' }),
      SECRETO,
    ],
  ])('con %s usa la IP de la conexión', (_caso, p, secreto) => {
    expect(ipDelClienteDe(p, secreto)).toBe('10.0.0.5');
  });
});
