'use strict';

const request = require('supertest');
const { buildApp, MAX_MESSAGE_LENGTH } = require('./app');

const app = buildApp();

describe('GET /healthz', () => {
  it('reports ok with an uptime', async () => {
    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});

describe('GET /version', () => {
  it('reports the baked-in commit', async () => {
    const res = await request(app).get('/version');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('commit');
    expect(res.body.node).toBe(process.versions.node);
  });
});

describe('POST /api/echo', () => {
  it('echoes a valid message with its length', async () => {
    const res = await request(app)
      .post('/api/echo')
      .send({ message: 'hello pipeline' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'hello pipeline', length: 14 });
  });

  it.each([
    ['a missing message', {}],
    ['a non-string message', { message: 42 }],
    ['an empty message', { message: '   ' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/echo').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects a message over the length limit', async () => {
    const res = await request(app)
      .post('/api/echo')
      .send({ message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('unknown routes', () => {
  it('returns 404 as JSON', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NotFound' });
  });
});

describe('security headers', () => {
  it('does not advertise the framework', async () => {
    const res = await request(app).get('/healthz');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
  });
});
