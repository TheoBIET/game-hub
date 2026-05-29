/**
 * Tiny module hosting `broadcastLobbyState`. Lives outside `handlers/lobby.ts`
 * so other modules (e.g. invite-driven joins) can import it without creating
 * a cycle through the handler registration code.
 */
import type { Io } from '../io.js';
import { roomChannel } from '../channels.js';
import { buildSnapshotFor, getRoom } from '../room-manager.js';

export function broadcastLobbyState(io: Io, code: string): void {
  const room = getRoom(code);
  if (!room) return;
  const sockets = io.sockets.adapter.rooms.get(roomChannel(code));
  if (!sockets) return;
  for (const sid of sockets) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    const pid = s.data.playerId;
    if (!pid) continue;
    s.emit('lobby:state', buildSnapshotFor(room, pid));
  }
}
