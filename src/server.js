'use strict';

const { buildApp } = require('./app');

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = buildApp().listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// Graceful shutdown. The orchestrator sends SIGTERM and then waits before
// SIGKILL; finishing in-flight requests here is what stops a rollout (or a
// blue-green cutover) from shedding a handful of requests on every deploy.
function shutdown(signal) {
  console.log(`${signal} received, draining connections`);

  const forceExit = setTimeout(() => {
    console.error('drain timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      console.error('error during shutdown:', err.message);
      process.exit(1);
    }
    console.log('drained cleanly');
    process.exit(0);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal));
}
