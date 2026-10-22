import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';

describe('GET /salud', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['salud', 'salud/listo'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 fuera del prefijo /api/v1', async () => {
    await request(app.getHttpServer())
      .get('/salud')
      .expect(200)
      .expect({ estado: 'ok' });
  });

  it('no existe bajo el prefijo', async () => {
    await request(app.getHttpServer()).get('/api/v1/salud').expect(404);
  });
});
