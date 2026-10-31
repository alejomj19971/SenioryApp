import {
  CHECK,
  FORANEA,
  UNICA,
  adultoMayorValido,
  conectarBd,
  insertar,
  nuevoId,
  rechazo,
  usuarioValido,
} from '../../soporte/bd.js';

describe('esquema identidad', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  async function familiarConPersona() {
    const familiar = usuarioValido();
    await insertar(bd, 'identidad.usuarios', familiar);
    const persona = adultoMayorValido(familiar.id);
    await insertar(bd, 'identidad.adultos_mayores', persona);
    return { familiar, persona };
  }

  describe('usuarios', () => {
    it('acepta un usuario válido', async () => {
      await insertar(
        bd,
        'identidad.usuarios',
        usuarioValido({ telefono: '+573001234567' }),
      );
    });

    it('rechaza un correo repetido SIN distinguir mayúsculas (citext)', async () => {
      const id = nuevoId();
      await insertar(
        bd,
        'identidad.usuarios',
        usuarioValido({ correo: `Andrea.${id}@Prueba.invalid` }),
      );

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.usuarios',
          usuarioValido({ correo: `andrea.${id}@prueba.invalid` }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'usuarios_correo_unico',
      });
    });

    it.each(['superusuario', 'Familiar', ''])(
      'rechaza el rol "%s"',
      async (rol) => {
        const r = await rechazo(() =>
          insertar(bd, 'identidad.usuarios', usuarioValido({ rol })),
        );
        expect(r).toMatchObject({
          codigo: CHECK,
          restriccion: 'usuarios_rol_valido',
        });
      },
    );

    it.each(['familiar', 'adulto_mayor', 'cuidador', 'administrador'])(
      'acepta el rol %s',
      async (rol) => {
        await insertar(bd, 'identidad.usuarios', usuarioValido({ rol }));
      },
    );

    it('rechaza un estado desconocido', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.usuarios',
          usuarioValido({ estado: 'dormido' }),
        ),
      );
      expect(r.restriccion).toBe('usuarios_estado_valido');
    });

    it.each(['', 'x'.repeat(101)])(
      'rechaza un nombre vacío o de más de 100 caracteres',
      async (nombre) => {
        const r = await rechazo(() =>
          insertar(bd, 'identidad.usuarios', usuarioValido({ nombre })),
        );
        expect(r.restriccion).toBe('usuarios_nombre_valido');
      },
    );

    it.each([
      '3001234567',
      '+57 300 123 4567',
      '+0573001234567',
      '+57300',
      'abc',
    ])('rechaza el teléfono %s (debe ser E.164)', async (telefono) => {
      const r = await rechazo(() =>
        insertar(bd, 'identidad.usuarios', usuarioValido({ telefono })),
      );
      expect(r.restriccion).toBe('usuarios_telefono_e164');
    });
  });

  describe('credenciales y sesiones', () => {
    it('rechaza intentos fallidos negativos', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);

      const r = await rechazo(() =>
        insertar(bd, 'identidad.credenciales', {
          usuario_id: u.id,
          hash: 'x',
          intentos_fallidos: -1,
        }),
      );
      expect(r.restriccion).toBe('credenciales_intentos_validos');
    });

    it('rechaza credenciales de un usuario inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'identidad.credenciales', {
          usuario_id: nuevoId(),
          hash: 'x',
        }),
      );
      expect(r.codigo).toBe(FORANEA);
    });

    it('rechaza dos sesiones con el mismo hash de token', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);
      const hash = Buffer.from(nuevoId().replaceAll('-', ''), 'hex');
      const sesion = () => ({
        id: nuevoId(),
        usuario_id: u.id,
        familia_id: nuevoId(),
        hash_del_token: hash,
        expira_en: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await insertar(bd, 'identidad.sesiones_refresco', sesion());

      const r = await rechazo(() =>
        insertar(bd, 'identidad.sesiones_refresco', sesion()),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'sesiones_refresco_hash_unico',
      });
    });

    it('rechaza una sesión que expira antes de ser emitida', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);

      const r = await rechazo(() =>
        insertar(bd, 'identidad.sesiones_refresco', {
          id: nuevoId(),
          usuario_id: u.id,
          familia_id: nuevoId(),
          hash_del_token: Buffer.from(nuevoId().replaceAll('-', ''), 'hex'),
          emitida_en: '2026-10-10T10:00:00Z',
          expira_en: '2026-10-10T09:00:00Z',
        }),
      );
      expect(r.restriccion).toBe('sesiones_refresco_vigencia_valida');
    });

    it('permite encadenar un token reemplazado con su reemplazo', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);
      const base = (id: string) => ({
        id,
        usuario_id: u.id,
        familia_id: nuevoId(),
        hash_del_token: Buffer.from(nuevoId().replaceAll('-', ''), 'hex'),
        expira_en: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const nuevo = nuevoId();
      await insertar(bd, 'identidad.sesiones_refresco', base(nuevo));
      await insertar(bd, 'identidad.sesiones_refresco', {
        ...base(nuevoId()),
        reemplazada_por: nuevo,
      });
    });

    it('al eliminar un usuario se borran sus credenciales y sesiones, y no deja huérfanos', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);
      await insertar(bd, 'identidad.credenciales', {
        usuario_id: u.id,
        hash: 'x',
      });
      await insertar(bd, 'identidad.sesiones_refresco', {
        id: nuevoId(),
        usuario_id: u.id,
        familia_id: nuevoId(),
        hash_del_token: Buffer.from(nuevoId().replaceAll('-', ''), 'hex'),
        expira_en: new Date(Date.now() + 86_400_000).toISOString(),
      });

      await bd.query(`delete from identidad.usuarios where id = $1`, [u.id]);

      const { rows } = await bd.query(
        `select (select count(*) from identidad.credenciales where usuario_id = $1)::int as cred,
                (select count(*) from identidad.sesiones_refresco where usuario_id = $1)::int as ses`,
        [u.id],
      );
      expect(rows[0]).toEqual({ cred: 0, ses: 0 });
    });
  });

  describe('tokens de recuperación de contraseña', () => {
    const hashAleatorio = () =>
      Buffer.from(
        nuevoId().replaceAll('-', '') + nuevoId().replaceAll('-', ''),
        'hex',
      );
    const token = (
      usuarioId: string,
      cambios: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      usuario_id: usuarioId,
      hash_del_token: hashAleatorio(),
      expira_en: new Date(Date.now() + 1_800_000).toISOString(),
      ...cambios,
    });

    it('acepta un token válido', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);

      await insertar(bd, 'identidad.tokens_de_recuperacion', token(u.id));
    });

    it('rechaza dos tokens con el mismo hash', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);
      const hash = hashAleatorio();
      await insertar(
        bd,
        'identidad.tokens_de_recuperacion',
        token(u.id, { hash_del_token: hash }),
      );

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.tokens_de_recuperacion',
          token(u.id, { hash_del_token: hash }),
        ),
      );

      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'tokens_de_recuperacion_hash_unico',
      });
    });

    it('rechaza un hash que no es un SHA-256 (32 bytes): guardar el token en claro es el error más grave', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.tokens_de_recuperacion',
          token(u.id, { hash_del_token: Buffer.from('un-token-en-claro') }),
        ),
      );

      expect(r.restriccion).toBe('tokens_de_recuperacion_hash_valido');
    });

    it('rechaza un token que expira antes de crearse', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.tokens_de_recuperacion',
          token(u.id, {
            creado_en: '2026-10-10T10:00:00Z',
            expira_en: '2026-10-10T09:00:00Z',
          }),
        ),
      );

      expect(r.restriccion).toBe('tokens_de_recuperacion_vigencia_valida');
    });

    it('rechaza un token de un usuario inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'identidad.tokens_de_recuperacion', token(nuevoId())),
      );

      expect(r.codigo).toBe(FORANEA);
    });

    it('al eliminar al usuario se borran sus tokens', async () => {
      const u = usuarioValido();
      await insertar(bd, 'identidad.usuarios', u);
      await insertar(bd, 'identidad.tokens_de_recuperacion', token(u.id));

      await bd.query('delete from identidad.usuarios where id = $1', [u.id]);

      const { rows } = await bd.query(
        'select 1 from identidad.tokens_de_recuperacion where usuario_id = $1',
        [u.id],
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('personas mayores', () => {
    it('una persona mayor solo puede tener una cuenta propia', async () => {
      const { familiar } = await familiarConPersona();
      const cuentaPropia = usuarioValido({ rol: 'adulto_mayor' });
      await insertar(bd, 'identidad.usuarios', cuentaPropia);
      await insertar(
        bd,
        'identidad.adultos_mayores',
        adultoMayorValido(familiar.id, { usuario_id: cuentaPropia.id }),
      );

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.adultos_mayores',
          adultoMayorValido(familiar.id, { usuario_id: cuentaPropia.id }),
        ),
      );
      expect(r.restriccion).toBe('adultos_mayores_usuario_unico');
    });

    it('rechaza una persona mayor creada por un usuario inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'identidad.adultos_mayores', adultoMayorValido(nuevoId())),
      );
      expect(r.codigo).toBe(FORANEA);
    });
  });

  describe('vínculos', () => {
    const vinculo = (
      familiarId: string,
      adultoMayorId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      familiar_id: familiarId,
      adulto_mayor_id: adultoMayorId,
      parentesco: 'hijo_hija',
      es_responsable: true,
      ...extra,
    });

    it('un familiar no puede tener dos vínculos ACTIVOS con la misma persona', async () => {
      const { familiar, persona } = await familiarConPersona();
      await insertar(
        bd,
        'identidad.vinculos',
        vinculo(familiar.id, persona.id),
      );

      const r = await rechazo(() =>
        insertar(bd, 'identidad.vinculos', vinculo(familiar.id, persona.id)),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'vinculos_activo_unico',
      });
    });

    it('tras revocar un vínculo se puede crear uno nuevo con la misma persona', async () => {
      const { familiar, persona } = await familiarConPersona();
      await insertar(
        bd,
        'identidad.vinculos',
        vinculo(familiar.id, persona.id, {
          estado: 'revocado',
          revocado_en: new Date().toISOString(),
        }),
      );
      await insertar(
        bd,
        'identidad.vinculos',
        vinculo(familiar.id, persona.id),
      );
    });

    it('un vínculo revocado debe tener fecha de revocación, y uno activo no', async () => {
      const { familiar, persona } = await familiarConPersona();

      const sinFecha = await rechazo(() =>
        insertar(
          bd,
          'identidad.vinculos',
          vinculo(familiar.id, persona.id, { estado: 'revocado' }),
        ),
      );
      const activoConFecha = await rechazo(() =>
        insertar(
          bd,
          'identidad.vinculos',
          vinculo(familiar.id, persona.id, {
            revocado_en: new Date().toISOString(),
          }),
        ),
      );

      expect(sinFecha.restriccion).toBe('vinculos_revocacion_coherente');
      expect(activoConFecha.restriccion).toBe('vinculos_revocacion_coherente');
    });

    it('rechaza un parentesco desconocido', async () => {
      const { familiar, persona } = await familiarConPersona();
      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.vinculos',
          vinculo(familiar.id, persona.id, { parentesco: 'vecino' }),
        ),
      );
      expect(r.restriccion).toBe('vinculos_parentesco_valido');
    });
  });

  describe('consentimientos (Ley 1581)', () => {
    const consentimiento = (
      adultoMayorId: string,
      otorgadoPor: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      adulto_mayor_id: adultoMayorId,
      finalidad: 'datos_de_salud',
      otorgado_por: otorgadoPor,
      calidad: 'representante',
      version_del_texto: 'v1',
      ...extra,
    });

    it('solo puede haber UN consentimiento vigente por persona y finalidad', async () => {
      const { familiar, persona } = await familiarConPersona();
      await insertar(
        bd,
        'identidad.consentimientos',
        consentimiento(persona.id, familiar.id),
      );

      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.consentimientos',
          consentimiento(persona.id, familiar.id),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'consentimientos_vigente_unico',
      });
    });

    it('tras revocarlo se puede otorgar uno nuevo y quedan los dos como historial', async () => {
      const { familiar, persona } = await familiarConPersona();
      const primero = consentimiento(persona.id, familiar.id);
      await insertar(bd, 'identidad.consentimientos', primero);
      await bd.query(
        `update identidad.consentimientos set revocado_en = now() where id = $1`,
        [primero.id],
      );

      await insertar(
        bd,
        'identidad.consentimientos',
        consentimiento(persona.id, familiar.id, { version_del_texto: 'v2' }),
      );

      const { rows } = await bd.query(
        `select count(*)::int as total from identidad.consentimientos where adulto_mayor_id = $1`,
        [persona.id],
      );
      expect(rows[0]?.total).toBe(2);
    });

    it('rechaza una finalidad o una calidad desconocidas', async () => {
      const { familiar, persona } = await familiarConPersona();
      const finalidad = await rechazo(() =>
        insertar(
          bd,
          'identidad.consentimientos',
          consentimiento(persona.id, familiar.id, { finalidad: 'marketing' }),
        ),
      );
      const calidad = await rechazo(() =>
        insertar(
          bd,
          'identidad.consentimientos',
          consentimiento(persona.id, familiar.id, { calidad: 'vecino' }),
        ),
      );

      expect(finalidad.restriccion).toBe('consentimientos_finalidad_valida');
      expect(calidad.restriccion).toBe('consentimientos_calidad_valida');
    });

    it('rechaza una revocación anterior al otorgamiento', async () => {
      const { familiar, persona } = await familiarConPersona();
      const r = await rechazo(() =>
        insertar(
          bd,
          'identidad.consentimientos',
          consentimiento(persona.id, familiar.id, {
            otorgado_en: '2026-10-10T10:00:00Z',
            revocado_en: '2026-10-09T10:00:00Z',
          }),
        ),
      );
      expect(r.restriccion).toBe('consentimientos_revocacion_posterior');
    });
  });

  it('una aceptación de política solo puede registrarse una vez por usuario y versión', async () => {
    const u = usuarioValido();
    await insertar(bd, 'identidad.usuarios', u);
    await insertar(bd, 'identidad.aceptaciones_de_politica', {
      usuario_id: u.id,
      version: 'v1',
    });
    await insertar(bd, 'identidad.aceptaciones_de_politica', {
      usuario_id: u.id,
      version: 'v2',
    });

    const r = await rechazo(() =>
      insertar(bd, 'identidad.aceptaciones_de_politica', {
        usuario_id: u.id,
        version: 'v1',
      }),
    );
    expect(r.codigo).toBe(UNICA);
  });
});
