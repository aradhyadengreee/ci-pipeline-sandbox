'use strict';

const express = require('express');
const helmet = require('helmet');

const MAX_MESSAGE_LENGTH = 280;

function buildApp() {
  const app = express();

  // Secure defaults: standard hardening headers, and no `X-Powered-By`.
  app.use(helmet());
  app.disable('x-powered-by');

  // Cap the body size so an oversized payload is rejected before parsing.
  app.use(express.json({ limit: '16kb' }));

  // Liveness/readiness probe. Kept dependency-free so it stays truthful even
  // when a downstream is unhealthy - a probe that checks everything reports
  // the whole system down when one dependency blips.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  });

  // Which build is actually serving traffic. GIT_COMMIT is baked in at image
  // build time, so this identifies the running version during a rollout.
  app.get('/version', (_req, res) => {
    res.json({
      commit: process.env.GIT_COMMIT || 'unknown',
      node: process.versions.node,
    });
  });

  app.post('/api/echo', (req, res) => {
    const { message } = req.body ?? {};

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        error: 'ValidationError',
        detail: '`message` is required and must be a non-empty string.',
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'ValidationError',
        detail: `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    return res.status(200).json({ message, length: message.length });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'NotFound' });
  });

  // Error handler. Logs server-side, returns nothing internal to the caller -
  // stack traces and driver messages are an information-disclosure path.
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'InternalServerError' });
  });

  return app;
}

module.exports = { buildApp, MAX_MESSAGE_LENGTH };
