import { NestExpressApplication } from '@nestjs/platform-express';
import { api, crearApp } from './utils/app';

describe('Límite de solicitudes (429)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => app.close());

  it('el login acepta 10 intentos por minuto por IP; el siguiente recibe 429 en problem+json', async () => {
    const intentos = [];
    for (let i = 0; i < 11; i++) {
      intentos.push(await api(app).post('/api/v1/auth/login').send({ email: 'nadie@crm.com', password: 'mala' }));
    }
    expect(intentos.slice(0, 10).every((r) => r.status === 401)).toBe(true);
    expect(intentos[10].status).toBe(429);
    expect(intentos[10].headers['content-type']).toContain('application/problem+json');
  });
});
