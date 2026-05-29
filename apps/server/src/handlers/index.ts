import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@tabswitch/types';
import type { Io } from '../io.js';
import { registerLobbyHandlers } from './lobby.js';
import { registerDispatchHandlers } from './dispatch.js';
import { registerPresenceHandlers } from '../presence/gateway.js';
import { registerInviteHandlers } from '../invites/handlers.js';

type TSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerHandlers(io: Io, socket: TSocket): void {
  registerLobbyHandlers(io, socket);
  registerDispatchHandlers(io, socket);
  registerPresenceHandlers(io, socket);
  registerInviteHandlers(io, socket);
}
