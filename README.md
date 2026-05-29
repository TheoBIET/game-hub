# TabSwitch

Open-source multiplayer mini-game hub. Create a room, share the code, hop between games — Tic-Tac-Toe, Connect 4, Rock-Paper-Scissors, GIF Battle…

> The repo folder is still named `gif-battle/` (legacy). The product and packages live under `@tabswitch/*`.

## Games

| Game | Package | Status |
| --- | --- | --- |
| Tic-Tac-Toe | `@tabswitch/tictactoe` | ✅ Reference — copy this when adding a new game |
| Connect 4 | `@tabswitch/connect4` | ✅ Playable |
| Rock-Paper-Scissors | `@tabswitch/rps` | ✅ Playable |
| GIF Battle | `@tabswitch/gif-battle` | 🚧 Logic ready, UI on `PlaceholderGame` — needs wiring to the `game:action` / `game:event` protocol |

## Stack

- **Web** — Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn-style components · next-intl (en/fr) · NextAuth v5
- **Realtime** — Node + Socket.IO 4 (+ Redis adapter for multi-instance, off by default)
- **Data** — Prisma 7 · Postgres (auth, profiles, replays soon)
- **Tooling** — Turborepo · pnpm workspaces · TypeScript 5.7 · Vitest
- **Deploy targets** — Vercel (web) · Fly.io (server) · Neon (Postgres) · Upstash (Redis)

## Structure

```
gif-battle/
├── apps/
│   ├── web/                  # Next.js (UI, API routes, auth)
│   └── server/               # Socket.IO server (in-memory room state)
├── packages/
│   ├── types/                # Shared Zod contracts (lobby, game, ws)
│   ├── ui/                   # shadcn-style components
│   ├── db/                   # Prisma client + schema
│   ├── config/               # Shared tsconfig / eslint
│   └── games/
│       ├── tictactoe/        # GameRoom implementation (reference)
│       ├── connect4/
│       ├── rps/
│       └── gif-battle/
├── infra/
│   └── docker-compose.dev.yml   # Postgres + Redis
└── docs/superpowers/specs/      # Design specs
```

## Getting started

Requirements: Node 22+, pnpm 10+, Docker.

```bash
pnpm install
pnpm infra:up                    # Postgres + Redis via Docker

# env
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env
# GIPHY_API_KEY (https://developers.giphy.com/dashboard) required for GIF Battle

pnpm db:push                     # apply the Prisma schema to Postgres
pnpm dev                         # web :3000 + server :4000 in parallel
```

Quick e2e check: open <http://localhost:3000/games/tictactoe>, create a room, open the room URL in a second tab/browser, play.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run web + server in parallel (turbo) |
| `pnpm dev:web` / `pnpm dev:server` | Single app |
| `pnpm build` | Build every package |
| `pnpm typecheck` | Strict TS across the monorepo |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm db:push` / `db:generate` / `db:studio` | Prisma |
| `pnpm infra:up` / `infra:down` | Docker Postgres + Redis |

## Add a game

1. `packages/games/<name>/` — implement the `GameRoom` interface from `@tabswitch/types`.
2. Register it in `apps/server/src/games/registry.ts`.
3. Add a card in `apps/web/app/page.tsx` and a page under `apps/web/app/games/<name>/`.
4. Communicate via the typed events `game:action` (client → server) and `game:event` (server → client).

Tic-Tac-Toe is the reference implementation — the shortest and most complete one to copy.

## Architecture notes

- **In-memory room state** in `apps/server/src/room-manager.ts` (`Map<code, RoomInstance>`). Single-instance for now; moving to a Redis-backed store is a follow-up.
- **Socket.IO kept** (instead of uWebSockets.js as the original spec mentioned) — existing handlers and the Redis adapter were too embedded to justify a swap right now.
- **Wire protocol** — first-class lobby events (`lobby:create`, `lobby:join`, `lobby:leave`, `lobby:kick`, `lobby:start`, `lobby:host:transfer`, `chat:send`). All gameplay events are tunneled through the generic pair `game:action` / `game:event` carrying `{ event, payload }`.

## Spec

`docs/superpowers/specs/` holds the detailed design specs (notably GIF Battle MVP/V1/V2).

## License

MIT.
