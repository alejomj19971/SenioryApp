import {
  CHECK,
  FORANEA,
  UNICA,
  ayer,
  conectarBd,
  cuidadorConVerificaciones,
  cuidadorValido,
  insertar,
  nuevoId,
  rechazo,
  usuarioValido,
} from '../../soporte/bd.js';

describe('esquema directorio', () => {
  const bd = conectarBd();
  afterAll(async () => {
    await bd.end();
  });

  const hacerVisible = (cuidadorId: string) =>
    bd.query(`update directorio.cuidadores set visible = true where id = $1`, [
      cuidadorId,
    ]);

  describe('E7: un cuidador solo es visible con las tres verificaciones aprobadas y vigentes', () => {
    it('NO puede insertarse ya visible (todavía no tiene verificaciones)', async () => {
      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.cuidadores',
          cuidadorValido({ estado: 'activo', visible: true }),
        ),
      );

      expect(r.codigo).toBe(CHECK);
      expect(r.mensaje).toContain(
        'no puede ser visible sin las tres verificaciones',
      );
    });

    it('un cuidador sin verificaciones no puede marcarse visible', async () => {
      const cuidador = cuidadorValido({ estado: 'activo' });
      await insertar(bd, 'directorio.cuidadores', cuidador);

      const r = await rechazo(() => hacerVisible(cuidador.id));
      expect(r.mensaje).toContain('no puede ser visible');
    });

    it.each([
      ['solo antecedentes', ['antecedentes']],
      ['antecedentes y títulos', ['antecedentes', 'titulos']],
      ['títulos y psicotécnica', ['titulos', 'psicotecnica']],
    ])(
      'con %s (menos de tres controles) tampoco',
      async (_nombre, controles) => {
        const id = await cuidadorConVerificaciones(bd, { controles });

        const r = await rechazo(() => hacerVisible(id));
        expect(r.codigo).toBe(CHECK);
      },
    );

    it('con los tres controles aprobados SÍ puede ser visible', async () => {
      const id = await cuidadorConVerificaciones(bd);

      await hacerVisible(id);

      const { rows } = await bd.query(
        `select visible from directorio.cuidadores where id = $1`,
        [id],
      );
      expect(rows[0]?.visible).toBe(true);
    });

    it('una verificación vencida (vigente_hasta pasado) no cuenta', async () => {
      const id = await cuidadorConVerificaciones(bd, { vigenteHasta: ayer() });

      const r = await rechazo(() => hacerVisible(id));
      expect(r.codigo).toBe(CHECK);
    });

    it('una verificación pendiente o rechazada no cuenta', async () => {
      const id = await cuidadorConVerificaciones(bd, {
        controles: ['antecedentes', 'titulos'],
      });
      await insertar(bd, 'directorio.verificaciones', {
        id: nuevoId(),
        cuidador_id: id,
        control: 'psicotecnica',
        estado: 'pendiente',
      });

      const r = await rechazo(() => hacerVisible(id));
      expect(r.codigo).toBe(CHECK);
    });

    it('visible exige además que el cuidador esté activo', async () => {
      const id = await cuidadorConVerificaciones(bd);
      await bd.query(
        `update directorio.cuidadores set estado = 'suspendido' where id = $1`,
        [id],
      );

      const r = await rechazo(() => hacerVisible(id));
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'cuidadores_visible_si_activo',
      });
    });

    it('ocultar a un cuidador siempre es posible', async () => {
      const id = await cuidadorConVerificaciones(bd);
      await hacerVisible(id);

      await bd.query(
        `update directorio.cuidadores set visible = false, estado = 'suspendido' where id = $1`,
        [id],
      );
    });
  });

  describe('cuidadores', () => {
    it('acepta un cuidador válido, oculto por defecto', async () => {
      const cuidador = cuidadorValido();
      await insertar(bd, 'directorio.cuidadores', cuidador);

      const { rows } = await bd.query(
        `select visible, estado, aceptacion_automatica from directorio.cuidadores where id = $1`,
        [cuidador.id],
      );
      expect(rows[0]).toEqual({
        visible: false,
        estado: 'borrador',
        aceptacion_automatica: false,
      });
    });

    it.each([
      [
        'especialidad desconocida',
        { especialidad: 'curandero' },
        'cuidadores_especialidad_valida',
      ],
      ['tarifa en cero', { tarifa_hora: 0 }, 'cuidadores_tarifa_valida'],
      ['tarifa negativa', { tarifa_hora: -5000 }, 'cuidadores_tarifa_valida'],
      [
        'experiencia negativa',
        { anios_experiencia: -1 },
        'cuidadores_experiencia_valida',
      ],
      [
        'experiencia irreal',
        { anios_experiencia: 61 },
        'cuidadores_experiencia_valida',
      ],
      [
        'disponibilidad vacía',
        { disponibilidad: [] },
        'cuidadores_disponibilidad_valida',
      ],
      [
        'jornada inexistente',
        { disponibilidad: ['manana', 'madrugada'] },
        'cuidadores_disponibilidad_valida',
      ],
      ['estado desconocido', { estado: 'dormido' }, 'cuidadores_estado_valido'],
      [
        'bio de más de 1000 caracteres',
        { bio: 'x'.repeat(1001) },
        'cuidadores_bio_valida',
      ],
      [
        'teléfono sin formato internacional',
        { telefono: '3001234567' },
        'cuidadores_telefono_e164',
      ],
      [
        'conteos negativos',
        { servicios_completados: -1 },
        'cuidadores_contadores_validos',
      ],
    ])('rechaza: %s', async (_nombre, extra, restriccion) => {
      const r = await rechazo(() =>
        insertar(bd, 'directorio.cuidadores', cuidadorValido(extra)),
      );
      expect(r).toMatchObject({ codigo: CHECK, restriccion });
    });

    it('la calificación acumulada debe ser coherente con las reseñas', async () => {
      const sinResenasConSuma = await rechazo(() =>
        insertar(
          bd,
          'directorio.cuidadores',
          cuidadorValido({ cantidad_resenas: 0, suma_calificaciones: 5 }),
        ),
      );
      const promedioImposible = await rechazo(() =>
        insertar(
          bd,
          'directorio.cuidadores',
          cuidadorValido({ cantidad_resenas: 2, suma_calificaciones: 11 }),
        ),
      );
      await insertar(
        bd,
        'directorio.cuidadores',
        cuidadorValido({ cantidad_resenas: 2, suma_calificaciones: 9 }),
      );

      expect(sinResenasConSuma.restriccion).toBe(
        'cuidadores_calificacion_coherente',
      );
      expect(promedioImposible.restriccion).toBe(
        'cuidadores_calificacion_coherente',
      );
    });

    it('un usuario solo puede ser un cuidador', async () => {
      const u = usuarioValido({ rol: 'cuidador' });
      await insertar(bd, 'identidad.usuarios', u);
      await insertar(
        bd,
        'directorio.cuidadores',
        cuidadorValido({ usuario_id: u.id }),
      );

      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.cuidadores',
          cuidadorValido({ usuario_id: u.id }),
        ),
      );
      expect(r.restriccion).toBe('cuidadores_usuario_unico');
    });

    it('permite varios cuidadores sin cuenta (usuario_id nulo)', async () => {
      await insertar(bd, 'directorio.cuidadores', cuidadorValido());
      await insertar(bd, 'directorio.cuidadores', cuidadorValido());
    });
  });

  describe('búsqueda sin tildes', () => {
    it('encuentra por coincidencia parcial y por similitud usando los índices trigram', async () => {
      const marca = nuevoId().slice(0, 8);
      await insertar(
        bd,
        'directorio.cuidadores',
        cuidadorValido({
          nombre: 'José Múnera',
          nombre_busqueda: `jose munera ${marca}`,
        }),
      );

      const parcial = await bd.query(
        `select 1 from directorio.cuidadores where nombre_busqueda ilike $1`,
        [`%jose munera ${marca}%`],
      );
      const similar = await bd.query(
        `select 1 from directorio.cuidadores where nombre_busqueda % $1 and nombre_busqueda like $2`,
        [`jose munerra ${marca}`, `%${marca}`],
      );

      expect(parcial.rowCount).toBe(1);
      expect(similar.rowCount).toBe(1);
    });
  });

  describe('verificaciones', () => {
    const verificacion = (
      cuidadorId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      cuidador_id: cuidadorId,
      control: 'antecedentes',
      ...extra,
    });

    async function cuidadorBase() {
      const c = cuidadorValido();
      await insertar(bd, 'directorio.cuidadores', c);
      return c.id;
    }

    it('solo puede haber una verificación vigente (pendiente o aprobada) por control', async () => {
      const id = await cuidadorBase();
      await insertar(bd, 'directorio.verificaciones', verificacion(id));

      const r = await rechazo(() =>
        insertar(bd, 'directorio.verificaciones', verificacion(id)),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'verificaciones_vigente_unica',
      });
    });

    it('las verificaciones vencidas o rechazadas quedan como historial y permiten una nueva', async () => {
      const id = await cuidadorBase();
      await insertar(
        bd,
        'directorio.verificaciones',
        verificacion(id, { estado: 'vencida' }),
      );
      await insertar(
        bd,
        'directorio.verificaciones',
        verificacion(id, {
          estado: 'rechazada',
          motivo_rechazo: 'Documento ilegible',
        }),
      );
      await insertar(bd, 'directorio.verificaciones', verificacion(id));
    });

    it('un rechazo exige motivo', async () => {
      const id = await cuidadorBase();
      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.verificaciones',
          verificacion(id, { estado: 'rechazada' }),
        ),
      );
      expect(r.restriccion).toBe('verificaciones_rechazo_con_motivo');
    });

    it('una aprobación exige revisor y fecha de revisión', async () => {
      const id = await cuidadorBase();
      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.verificaciones',
          verificacion(id, { estado: 'aprobada' }),
        ),
      );
      expect(r.restriccion).toBe('verificaciones_aprobacion_con_revisor');
    });

    it('rechaza un control o un estado desconocidos', async () => {
      const id = await cuidadorBase();
      const control = await rechazo(() =>
        insertar(
          bd,
          'directorio.verificaciones',
          verificacion(id, { control: 'horoscopo' }),
        ),
      );
      const estado = await rechazo(() =>
        insertar(
          bd,
          'directorio.verificaciones',
          verificacion(id, { estado: 'quizas' }),
        ),
      );
      expect(control.restriccion).toBe('verificaciones_control_valido');
      expect(estado.restriccion).toBe('verificaciones_estado_valido');
    });

    it('rechaza una verificación de un cuidador inexistente', async () => {
      const r = await rechazo(() =>
        insertar(bd, 'directorio.verificaciones', verificacion(nuevoId())),
      );
      expect(r.codigo).toBe(FORANEA);
    });
  });

  describe('documentos (hallazgo H10: público solo lo aprobado y no sensible)', () => {
    const documento = (
      cuidadorId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      cuidador_id: cuidadorId,
      tipo: 'hoja_de_vida',
      clave_almacenamiento: `cuidadores/${nuevoId()}.pdf`,
      nombre_original: 'hoja-de-vida.pdf',
      tipo_mime: 'application/pdf',
      tamano_bytes: 120_000,
      sha256: Buffer.alloc(32, 1),
      ...extra,
    });

    async function cuidadorBase() {
      const c = cuidadorValido();
      await insertar(bd, 'directorio.cuidadores', c);
      return c.id;
    }

    it('una hoja de vida aprobada puede ser pública', async () => {
      const id = await cuidadorBase();
      await insertar(
        bd,
        'directorio.documentos',
        documento(id, { estado: 'aprobado', es_publico: true }),
      );
    });

    it.each([
      [
        'una hoja de vida aún sin aprobar',
        { tipo: 'hoja_de_vida', estado: 'pendiente' },
      ],
      [
        'una cédula, aunque esté aprobada',
        { tipo: 'cedula', estado: 'aprobado' },
      ],
      [
        'unos antecedentes, aunque estén aprobados',
        { tipo: 'antecedentes', estado: 'aprobado' },
      ],
    ])('NO puede ser pública %s', async (_nombre, extra) => {
      const id = await cuidadorBase();
      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.documentos',
          documento(id, { ...extra, es_publico: true }),
        ),
      );
      expect(r).toMatchObject({
        codigo: CHECK,
        restriccion: 'documentos_publico_solo_si_aprobado',
      });
    });

    it.each([
      [
        'de más de 10 MB',
        { tamano_bytes: 10_485_761 },
        'documentos_tamano_valido',
      ],
      ['vacío', { tamano_bytes: 0 }, 'documentos_tamano_valido'],
      [
        'de un tipo de archivo no permitido',
        { tipo_mime: 'application/x-msdownload' },
        'documentos_tipo_mime_valido',
      ],
      [
        'de un tipo de documento desconocido',
        { tipo: 'selfie' },
        'documentos_tipo_valido',
      ],
    ])('rechaza un archivo %s', async (_nombre, extra, restriccion) => {
      const id = await cuidadorBase();
      const r = await rechazo(() =>
        insertar(bd, 'directorio.documentos', documento(id, extra)),
      );
      expect(r.restriccion).toBe(restriccion);
    });

    it('dos documentos no pueden apuntar al mismo archivo almacenado', async () => {
      const id = await cuidadorBase();
      const primero = documento(id);
      await insertar(bd, 'directorio.documentos', primero);

      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.documentos',
          documento(id, { clave_almacenamiento: primero.clave_almacenamiento }),
        ),
      );
      expect(r.restriccion).toBe('documentos_clave_unica');
    });
  });

  describe('reseñas', () => {
    const resena = (
      cuidadorId: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id: nuevoId(),
      cuidador_id: cuidadorId,
      servicio_id: nuevoId(),
      autor_visible: 'Andrea G.',
      calificacion: 5,
      comentario: 'Excelente.',
      ...extra,
    });

    async function cuidadorBase() {
      const c = cuidadorValido();
      await insertar(bd, 'directorio.cuidadores', c);
      return c.id;
    }

    it('solo puede haber una reseña por servicio (el manejador del evento es idempotente)', async () => {
      const id = await cuidadorBase();
      const primera = resena(id);
      await insertar(bd, 'directorio.resenas', primera);

      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.resenas',
          resena(id, { servicio_id: primera.servicio_id }),
        ),
      );
      expect(r).toMatchObject({
        codigo: UNICA,
        restriccion: 'resenas_servicio_unica',
      });
    });

    it.each([0, 6, -1])(
      'rechaza la calificación %s (solo de 1 a 5)',
      async (calificacion) => {
        const id = await cuidadorBase();
        const r = await rechazo(() =>
          insertar(bd, 'directorio.resenas', resena(id, { calificacion })),
        );
        expect(r.restriccion).toBe('resenas_calificacion_valida');
      },
    );

    it('rechaza un comentario de más de 500 caracteres', async () => {
      const id = await cuidadorBase();
      const r = await rechazo(() =>
        insertar(
          bd,
          'directorio.resenas',
          resena(id, { comentario: 'x'.repeat(501) }),
        ),
      );
      expect(r.restriccion).toBe('resenas_comentario_valido');
    });
  });
});
