# Social Layer — Design

**Date:** 2026-05-29
**Status:** Approved (brainstorming)
**Scope:** Presence, friends-online dock, direct in-game invites, lobby ACL

## 1. Goals

Bring a Steam/Discord-style social layer to TabSwitch:

- Show how many players are currently online.
- Let signed-in users see which of their friends are online and what they're doing.
- Let users invite friends directly into a lobby without sharing the 4-letter code.
- Let hosts open their lobby to friends or lock it down (private) — with a one-click "Join" from the friends dock when allowed.

## 2. Non-goals

- No DMs / chat.
- No blocking model (mutual unfollow is the consent lever).
- No invitation history / inbox — invites are ephemeral (60s TTL).
- No invite-request flow ("can I join your private lobby?") — host must initiate.
- No per-game presence richness beyond "in lobby / in game" (we do not surface what the player is doing inside a game).
- No new Prisma migration.

## 3. Decisions taken during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **Friendship = mutual `Follow`** (A↔B). | Reuses the existing `Follow` table; no new migration. |
| 2 | **Presence states: `online` / `idle` / `in_lobby` / `in_game`.** | Mirrors Steam/Discord; makes the dock genuinely useful (1-click join). |
| 3 | **Lobby ACL: 3 modes — `public` / `friends` / `private`.** | Full granularity, matches user request. |
| 4 | **Invitations are ephemeral** (toast + son, 60s TTL, no DB). | Online-only friends are invitable anyway; avoids inbox UX scope. |
| 5 | **Dock = floating bottom-right FAB + side-sheet.** Global online count in `HubNav`. | Non-intrusive; mobile-friendly via bottom-sheet variant. |
| 6 | **No `invite:request` event for private lobbies.** | Just shows a "🔒 Privé" badge; host must use the dock to invite. Keeps MVP small. |
| 7 | **"Invite" button disabled when host has no active lobby** (tooltip "Crée un lobby d'abord"). | Avoids designing a game-picker modal in the dock. |
| 8 | **Transport = Socket.IO rooms for fanout + Redis HSET for canonical state** (approach C). | Leverages the Redis adapter already installed; cleanest separation. |

## 4. Architecture

A new **social** layer, isolated from the game packages. Games are unaware of presence.

### 4.1 Server (`apps/server`)

```
apps/server/src/
  presence/
    store.ts         # Redis-backed presence state (HSET wrapper)
    gateway.ts       # Socket.IO handlers: hello, setIdle, connect/disconnect
    friends.ts       # Mutual-follow lookup (Prisma) with 30s LRU cache
  invites/
    store.ts         # In-memory Map + Redis SETEX mirror
    handlers.ts      # invite:send, invite:accept, invite:decline
  handlers/
    lobby.ts         # Extended with: lobby:setAccessMode, ACL check on join
```

- **`presence/store.ts`** is the single source of truth. Functions: `setOnline / setIdle / setInRoom / setInGame / clear / getGlobalCount`. All operations are atomic Redis ops.
- **`presence/gateway.ts`** : on connect, joins `user:${userId}` and `friends-of:${userId}` rooms, subscribes to `friends-of:${friendId}` for each mutual friend, calls `setOnline`. On disconnect, schedules `setOffline` after 5 s (anti-flicker reload).
- **`invites/store.ts`** keeps an in-memory `Map<inviteId, Invite>` with `setTimeout` purge, mirrored to Redis (`SETEX invite:<id> 60`) so a second server process can validate `invite:accept`.
- **`handlers/lobby.ts`** gets an extended `LobbyRoom` (adds `accessMode: 'public' | 'friends' | 'private'`, default `'public'`) and the `checkAccess` gate (see §6).

### 4.2 Web (`apps/web`)

```
apps/web/
  lib/presence.ts                       # Zustand store, listens to socket events
  components/social/
    FriendsDock.tsx                     # FAB + side-sheet
    FriendRow.tsx                       # one row in the dock
    OnlineCount.tsx                     # badge in HubNav
    IncomingInviteToast.tsx             # extends the existing toast system
  components/lobby/
    AccessModeToggle.tsx                # host-only segmented control
  hooks/useIdleDetection.ts             # Page Visibility + 3min activity timer
```

### 4.3 Boundary with games

Games keep no knowledge of presence. The only change in the lobby/room layer:

- `LobbyRoom.accessMode` field (server in-memory only).
- New events `lobby:setAccessMode` (client→server) and `lobby:accessChanged` (server→clients in the room).
- `joinRoom` accepts an internal `{ bypassAcl?: boolean }` flag, set only when called from `invite:accept`.

## 5. Data model

### 5.1 Prisma — unchanged

The existing `Follow { followerId, followingId }` table is reused. Mutual friendship is derived:

```sql
SELECT followingId FROM Follow
WHERE followerId = :me
  AND followingId IN (SELECT followerId FROM Follow WHERE followingId = :me);
```

Cached per-user in-memory on the server for 30 s (LRU) to avoid spamming Prisma on reconnects.

### 5.2 Redis (canonical state)

```
HSET presence:state  <userId> '{"status":"online|idle|in_lobby|in_game","since":<ts>}'
HSET presence:room   <userId> '<roomCode>'                # absent when not in a lobby
SADD presence:sockets:<userId> <socketId>                 # multi-tab support
```

- Global online count = `HLEN presence:state`.
- Multi-tab: user is online while `SCARD presence:sockets:<userId> > 0`; offline after the set is empty for 5 s.
- Boot-time sweep clears stale keys (crash recovery).

### 5.3 Redis (ephemeral invites)

```
SETEX invite:<inviteId>           60  '{"from":<userId>,"to":<userId>,"room":"<code>","gameType":"<type>"}'
SADD  invite:to:<userId> <inviteId>   # reverse index for cleanup on logout
SETEX invite:cooldown:<from>:<to> 30  '1'  # rate limit: one invite per pair / 30s
```

### 5.4 In-memory server (extends `LobbyRoom`)

```ts
type LobbyRoom = {
  // ...existing fields
  accessMode: 'public' | 'friends' | 'private'; // default 'public'
};
```

### 5.5 Client (Zustand `usePresence`)

```ts
type PresenceStore = {
  globalOnline: number;
  friends: Record<UserId, FriendState>;
  incomingInvites: Invite[];
};

type FriendState = {
  nickname: string;
  slug: string;
  avatar: string | null;
  status: 'online' | 'idle' | 'in_lobby' | 'in_game';
  roomCode: string | null;
  gameType: string | null;
  accessMode: 'public' | 'friends' | 'private' | null; // null when in_game or unknown
};
```

## 6. Socket.IO contracts

Typed in `@tabswitch/types`, extending the existing `ClientToServerEvents` / `ServerToClientEvents`.

### Client → Server

```ts
'presence:hello'      ()                                   // post-auth; triggers subscribe + snapshot
'presence:setIdle'    (idle: boolean)                      // Page Visibility + 3min inactivity
'invite:send'         (toUserId: string, roomCode: string) → ack { ok: true, inviteId } | { ok: false, reason }
'invite:accept'       (inviteId: string)                   → ack { ok: true, roomCode } | { ok: false, reason }
'invite:decline'      (inviteId: string)                   → ack { ok: true }
'lobby:setAccessMode' (mode: 'public'|'friends'|'private') → ack { ok, error? }   // host-only
```

### Server → Client

```ts
'presence:snapshot'   ({ globalOnline, friends: FriendState[] })  // initial state
'presence:friend'     (FriendState)                               // diff: one friend's state changed
'presence:global'     ({ count: number })                         // throttled 2s, broadcast to all
'invite:incoming'     (Invite)                                    // a friend invites you
'invite:expired'      ({ inviteId })                              // TTL reached
'lobby:accessChanged' ({ roomCode, accessMode })                  // within the room
```

### Error reasons (typed enum)

```
NOT_FRIEND | FRIEND_OFFLINE | ROOM_FULL | ROOM_NOT_FOUND
INVITE_EXPIRED | ALREADY_IN_ROOM | ACCESS_DENIED | NOT_HOST | RATE_LIMITED
```

### Fanout logic

- `presence:friend` → emitted into `friends-of:${myUserId}` → only mutual friends receive it.
- `presence:global` → broadcast to root namespace, throttled 2 s (latch).
- 5 s grace before `setOffline` on socket disconnect (anti-flicker reload).

## 7. Flows

### 7.1 Invitation (happy path)

```
1. Alice (host of ABCD) opens the dock, sees Bob online, clicks "Inviter".
2. Web → Server : invite:send(bobUserId, "ABCD")
3. Server: checks (mutual friends + Bob online + Alice in ABCD + cooldown OK)
           → mints inviteId (ULID)
           → SETEX invite:<id> 60 + SADD invite:to:bob <id> + cooldown key
           → emit 'invite:incoming' to room user:bob
           → ack to Alice { ok:true, inviteId }
4. Bob receives toast (Alice's avatar, "rejoindre GIF Battle ?", Accept/Décline, sound).
5. Bob clicks Accept → Server: invite:accept(id)
           → check Redis (exists + to === bob)
           → DEL invite:<id> + SREM invite:to:bob
           → internal call joinRoom(bob, "ABCD", { bypassAcl: true })
           → ack { ok:true, roomCode:"ABCD" }
6. Bob's web: router.push(`/r/ABCD`)
```

### 7.2 Error cases

| Case | Behavior |
|---|---|
| Bob offline at `send` | ack `FRIEND_OFFLINE`, toast to Alice |
| Invitation cooldown active | ack `RATE_LIMITED`, toast to Alice |
| TTL reached before accept | server emits `invite:expired` to Bob (dismisses toast) |
| Alice leaves before Bob accepts | invite still valid; Bob joins the remaining room (or sees "room introuvable") |
| Room full at accept time | `ROOM_FULL` ack, toast to Bob |
| Bob already in another room | `ALREADY_IN_ROOM` (server leaves the previous room first, current behavior) |

### 7.3 Lobby ACL check

```ts
function checkAccess(room, joinerUserId, options) {
  if (options.bypassAcl) return OK;                          // via invite:accept
  if (room.accessMode === 'public') return OK;
  if (room.accessMode === 'private') return ACCESS_DENIED;
  // friends mode
  if (!areMutualFriends(room.hostId, joinerUserId)) return ACCESS_DENIED;
  return OK;
}
```

**Guests (no userId):**

- `public` → OK (current behavior).
- `friends` / `private` → `ACCESS_DENIED`. The web shows "Cette room est réservée aux amis du host — connecte-toi pour rejoindre."

## 8. UI / UX

### 8.1 Global online count

Badge in `HubNav`, left of `UserMenu`: `● 42 en ligne` (pulsing green dot). Tooltip: "Joueurs connectés en ce moment". Throttled 2 s. Hidden when logged-out.

### 8.2 Friends dock

- **Collapsed:** round FAB 48 px bottom-right, stacked avatars + count badge. Tooltip: "Amis (3 en ligne)".
- **Expanded:** 320 px side-sheet (slide-in right, Framer Motion). Closes on X / outside click / Esc.
- **Header:** "Amis" + segmented filter `Tous / En ligne`.
- **Row layout:**
  ```
  [avatar+dot]  Nickname        [contextual action]
                statut (italic gray)
  ```
- **Status dot:** vert=online, orange=idle, violet=in_lobby/in_game.
- **Contextual action per status:**
  - `online` → "Inviter" ghost button (disabled with tooltip "Crée un lobby d'abord" when host has no active lobby).
  - `in_lobby` (mode public/friends) → "Rejoindre →" accent button + subtitle "GIF Battle · ABCD".
  - `in_lobby` (mode private) → "🔒 Privé" non-clickable badge + subtitle "GIF Battle".
  - `in_game` → "En partie" non-clickable badge + subtitle "GIF Battle".
  - `idle` → just the subtitle "Inactif", no action.
  - `offline` → grayed out, no action.
- **Empty state:** light illustration + "Personne d'en ligne. Tes amis arrivent quand ils se connectent." + link to `/profile/<slug>` to follow people.

### 8.3 Incoming invite toast

- `invite:incoming` → top-center toast (existing system) + animated badge on the FAB.
- Toast content: avatar + "X t'invite à jouer à \<Game\>" + Accepter (accent) / Décline (ghost).
- Auto-dismiss at 60 s (synced with TTL).
- Sound: short Web Audio cue, `/sounds/invite.mp3` (~80 ko), silenced if `prefers-reduced-motion` or user toggled off in `/settings`.
- Multiple parallel invites stack inside the expanded dock under a "Invitations (2)" header.

### 8.4 Lobby `AccessModeToggle`

Host-only, in the lobby header next to the room code. Segmented control with 3 buttons:

| Mode | Tooltip |
|---|---|
| `Public 🌍` (default) | Toute personne avec le code peut rejoindre |
| `Amis 👥` | Tes amis peuvent voir et rejoindre, le code marche aussi pour eux |
| `Privé 🔒` | Sur invitation uniquement, même avec le code |

Switching emits `lobby:setAccessMode` + broadcasts a toast "Lobby passé en mode X" to everyone in the room.

### 8.5 Mobile (< 640 px)

- FAB stays bottom-right.
- Side-sheet becomes bottom-sheet full-screen.
- `HubNav` hides the global online count to save space.

### 8.6 Accessibility & i18n

- FAB + invite buttons get `aria-label`.
- Sound respects `prefers-reduced-motion` (silent if reduced) + toggle in `/settings` ("Sons d'invitations").
- Focus trap inside expanded side-sheet.
- All strings live under `social.*` and `lobby.access.*` in `messages/{fr,en}.json`.

## 9. Testing strategy

- **Unit (Vitest)**
  - `presence/store.ts` — set/clear/idle transitions, multi-socket counting.
  - `invites/store.ts` — TTL, idempotent accept (second accept fails).
  - `lobby/checkAccess.ts` — matrix of 3 modes × {guest, friend, stranger, host, invited}.
- **Integration server (Vitest + ioredis-mock + socket.io-client)**
  - Two sockets, A invites B, B accepts → B is in the room.
  - ACL `friends` blocks a non-friend; bypass via `invite:accept` succeeds.
  - `presence:global` throttle at 2 s.
  - Anti-flicker reconnect within 5 s does not flip to offline.
- **E2E (Playwright, smoke)** — follows existing gif-battle e2e pattern.
  - Two browsers authenticated, A sees B in the dock, A switches lobby to `friends`, B joins in one click.
- **No UI snapshots** — the dock will evolve; Playwright covers behavior.

## 10. Observability

- Structured console logs (existing format): `presence.connect`, `presence.disconnect`, `presence.idle`, `invite.sent`, `invite.accepted`, `invite.expired`, `invite.declined`, `lobby.access_changed`.
- `HLEN presence:state` exposed on the existing `/health` endpoint.
- Boot-time log: "Redis presence store ready (N stale keys cleared)".
- No Prometheus for MVP — Railway logs are sufficient.

## 11. Rollout

No feature flag (additive feature, no gameplay impact). Three sequential PRs to keep reviews small:

1. **PR 1 — Presence + global count.** Redis store, gateway, `presence:hello` handler, badge in HubNav. No dock yet. Shippable.
2. **PR 2 — Friends dock + lobby ACL.** `FriendsDock`, `AccessModeToggle`, ACL handlers. Dock lists online friends + "Join" button. Invite button still disabled. Shippable.
3. **PR 3 — Invitations.** `invite:send/accept/decline`, toasts, sound, inbox in dock. Shippable.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Redis `presence:state` grows with MAU | Trivial for <10k concurrent users (HSET); shard by `hash(userId)` later if needed. |
| Friend-graph lookup on every connect spams Prisma | In-memory LRU cache per userId, 30 s TTL. |
| Multi-tab presence races | `SADD presence:sockets:<userId>`; offline only when set empty 5 s. |
| Toast spam from a single friend | Cooldown key `invite:cooldown:<from>:<to>` (30 s SETEX). |
| Stale Redis keys after a crash | Boot-time sweep + multi-socket set TTL fallback (24 h). |

## 13. Open questions

None — all blockers resolved during brainstorming.
