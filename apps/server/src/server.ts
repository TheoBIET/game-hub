import http from 'node:http';
import { env } from './env.js';
import { log } from './log.js';
import { createIo } from './io.js';
import { listGameDefinitions } from './games/registry.js';
import { wireGifBattlePhrases } from './games/gif-battle-phrases.js';
import { getPresenceStore } from './presence/index.js';

async function main(): Promise<void> {
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      const presence = getPresenceStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          version: process.env.npm_package_version ?? 'dev',
          presence: presence._debug(),
        }),
      );
      return;
    }
    if (req.url === '/games') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', env.WEB_ORIGIN);
      res.end(
        JSON.stringify({
          games: listGameDefinitions().map((g) => ({
            gameType: g.gameType,
            name: g.name,
            tagline: g.tagline,
            minPlayers: g.minPlayers,
            maxPlayers: g.maxPlayers,
            spectatorsAllowed: g.spectatorsAllowed,
          })),
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  wireGifBattlePhrases();
  createIo(httpServer);

  httpServer.listen(env.PORT, () => {
    log.info(
      { port: env.PORT, origin: env.WEB_ORIGIN, games: listGameDefinitions().length },
      'tabswitch server listening',
    );
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info({ signal }, 'shutting down');
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5_000).unref();
    });
  }
}

main().catch((e) => {
  log.error({ err: e }, 'fatal startup error');
  process.exit(1);
});
