import * as Y from "yjs";
import * as sync from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { WebSocket } from "ws";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { readDesk } from "../src/lib/collaboration/document.js";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export type Room = { id: string; hash: string; doc: Y.Doc; awareness: awarenessProtocol.Awareness; clients: Map<WebSocket, Set<number>>; save: Promise<void>; timer?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout>; failure?: Error };
export class RoomService {
  private stopping = false;
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room>>();
  constructor(private directory: string) {}
  private async persist(room: Room) {
    const value = JSON.stringify({ hash: room.hash, state: Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString("base64") });
    room.save = room.save.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const path = join(this.directory, `${room.id}.json`);
      await writeFile(`${path}.tmp`, value, { mode: 0o600 }); await rename(`${path}.tmp`, path);
      room.failure = undefined;
    });
    return room.save;
  }
  private make(id: string, hash: string, state: Uint8Array) {
    const doc = new Y.Doc(); Y.applyUpdate(doc, state); readDesk(doc);
    const awareness = new awarenessProtocol.Awareness(doc); awareness.setLocalState(null);
    const room: Room = { id, hash, doc, awareness, clients: new Map(), save: Promise.resolve() };
    this.rooms.set(id, room);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0); sync.writeUpdate(encoder, update);
      this.broadcast(room, encoding.toUint8Array(encoder), origin);
      clearTimeout(room.timer); room.timer = setTimeout(() => { void this.persist(room).catch(error => { room.failure = error; for (const socket of room.clients.keys()) socket.close(1011, "Room persistence failed"); }); }, 250);
    });
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const owned = room.clients.get(origin as WebSocket);
      for (const id of added.concat(updated)) owned?.add(id);
      for (const id of removed) owned?.delete(id);
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed)));
      this.broadcast(room, encoding.toUint8Array(encoder));
    });
    return room;
  }
  private broadcast(room: Room, message: Uint8Array, exclude?: unknown) { for (const socket of room.clients.keys()) if (socket !== exclude && socket.readyState === WebSocket.OPEN) socket.send(message); }
  async create(state: Uint8Array) {
    if (this.rooms.size >= 100) throw Error("The service has reached its active room limit.");
    const id = randomBytes(16).toString("hex"); const token = randomBytes(32).toString("hex");
    const room = this.make(id, digest(token), state);
    try { await this.persist(room); } catch (error) { this.rooms.delete(id); room.awareness.destroy(); room.doc.destroy(); throw error; }
    return { room: id, token };
  }
  async load(id: string, token: string): Promise<Room> {
    if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) throw Error("Invalid room link.");
    let room = this.rooms.get(id);
    if (!room) {
      let loading = this.loading.get(id);
      if (!loading) {
        if (this.rooms.size + this.loading.size >= 100) throw Error("The service has reached its active room limit.");
        loading = readFile(join(this.directory, `${id}.json`), "utf8").then(value => { const data = JSON.parse(value); return this.make(id, data.hash, Buffer.from(data.state, "base64")); });
        this.loading.set(id, loading);
      }
      try { room = await loading; } finally { this.loading.delete(id); }
    }
    const expected = Buffer.from(room.hash, "hex"); const actual = Buffer.from(digest(token), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw Error("Invalid room link.");
    if (room.failure) throw Error("Room persistence is unavailable.");
    clearTimeout(room.idle); return room;
  }
  attach(room: Room, socket: WebSocket) {
    if (this.stopping || socket.readyState !== WebSocket.OPEN) { socket.terminate(); return; }
    room.clients.set(socket, new Set());
    const initial = encoding.createEncoder(); encoding.writeVarUint(initial, 0); sync.writeSyncStep1(initial, room.doc); socket.send(encoding.toUint8Array(initial));
    const awareness = encoding.createEncoder(); encoding.writeVarUint(awareness, 1);
    encoding.writeVarUint8Array(awareness, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()])); socket.send(encoding.toUint8Array(awareness));
    socket.on("message", (raw: Buffer) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(raw)); const kind = decoding.readVarUint(decoder);
        if (kind === 0) {
          // Validate on a disposable document before accepting mutations into the durable room.
          const candidate = new Y.Doc();
          try { Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.doc)); const scratch = encoding.createEncoder(); sync.readSyncMessage(decoding.createDecoder(raw.subarray(decoder.pos)), scratch, candidate, socket); readDesk(candidate); }
          finally { candidate.destroy(); }
          const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 0); sync.readSyncMessage(decoder, reply, room.doc, socket);
          if (encoding.length(reply) > 1) socket.send(encoding.toUint8Array(reply));
        } else if (kind === 1) {
          awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), socket);
        } else if (kind === 3) {
          const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 1); encoding.writeVarUint8Array(reply, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()])); socket.send(encoding.toUint8Array(reply));
        } else throw Error("Unsupported collaboration message.");
      } catch { socket.close(1008, "Invalid shared document update"); }
    });
    socket.on("close", () => {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...(room.clients.get(socket) ?? [])], socket); room.clients.delete(socket);
      if (!this.stopping && !room.clients.size) room.idle = setTimeout(() => { void this.release(room).catch(() => {}); }, 30_000).unref();
    });
  }
  private async release(room: Room) {
    clearTimeout(room.timer); await this.persist(room);
    if (room.clients.size) return;
    this.rooms.delete(room.id); room.awareness.destroy(); room.doc.destroy();
  }
  async stop() {
    this.stopping = true;
    await Promise.all([...this.rooms.values()].map(async room => {
      clearTimeout(room.timer); clearTimeout(room.idle);
      await Promise.all([...room.clients.keys()].map(socket => new Promise<void>(done => {
        if (socket.readyState === WebSocket.CLOSED) { done(); return; }
        socket.once("close", () => done()); socket.terminate();
      })));
      clearTimeout(room.timer);
      await this.persist(room); clearTimeout(room.idle); room.awareness.destroy(); room.doc.destroy();
    })); this.rooms.clear();
  }
}
