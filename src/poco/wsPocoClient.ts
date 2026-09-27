// The real Poco, over WebSocket. Same interface as MockPocoClient, so the UI
// cannot tell them apart.
//
// The laptop serves this app and the socket on one port, so the address is
// derived from wherever the page was loaded from (see serverUrl.ts) rather than
// typed in. It must be ws:, not wss: - an https page is not allowed to open a
// plain socket to a device on the LAN, which is why the app is served over
// http from the laptop.

import type { PocoAction, PocoClient, PocoEvent, PocoMode, PocoSettings } from './pocoClient';
import { serverUrl } from './serverUrl';

/** How long to wait for the laptop before giving up on connect(). */
const CONNECT_TIMEOUT_MS = 6000;
/** Grows to a ceiling so a laptop that is off does not get hammered. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

export class WsPocoClient implements PocoClient {
  private ws: WebSocket | undefined;
  private listeners = new Set<(e: PocoEvent) => void>();
  private ready = false;
  private wanted = false; // whether we should be connected at all
  private attempt = 0;
  private retry: number | undefined;
  /** Sent again after a reconnect: the server lets Poco drift when the app goes away. */
  private still = false;

  /** What the laptop last said it had attached. */
  public servos = false;
  public belly = false;

  connect(): Promise<void> {
    this.wanted = true;
    return new Promise((resolve, reject) => {
      const url = serverUrl();
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`no answer from ${url}`));
      }, CONNECT_TIMEOUT_MS);

      this.open(url, () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  private open(url: string, onReady?: () => void): void {
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleRetry(url);
      return;
    }

    this.ws.onopen = () => {
      this.attempt = 0;
      this.send({ op: 'hello' });
      if (this.still) this.send({ op: 'still', on: true });
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.op === 'ready') {
        this.ready = true;
        this.servos = Boolean(msg.servos);
        this.belly = Boolean(msg.belly);
        console.debug('[poco] ready', msg);
        onReady?.();
      } else if (msg.op === 'event') {
        // Poco noticed something on their own (Social Mode).
        for (const fn of this.listeners) fn(msg.event as PocoEvent);
      } else if (msg.op === 'error') {
        console.warn('[poco] server error:', msg.message);
      }
    };

    this.ws.onclose = () => {
      this.ready = false;
      // Only reconnect if nobody asked us to stop: a deliberate disconnect
      // should stay disconnected.
      if (this.wanted) this.scheduleRetry(url);
    };

    this.ws.onerror = () => {
      // onclose always follows, and handles the retry.
    };
  }

  private scheduleRetry(url: string): void {
    window.clearTimeout(this.retry);
    const wait = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)];
    this.attempt += 1;
    console.debug(`[poco] reconnecting in ${wait}ms`);
    this.retry = window.setTimeout(() => this.open(url), wait);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // Dropping is right: these are all "do this now" commands, and replaying
      // a gesture from ten seconds ago when the laptop comes back is worse
      // than not doing it.
      console.debug('[poco] not connected, dropped', msg.op);
    }
  }

  disconnect(): void {
    this.wanted = false;
    window.clearTimeout(this.retry);
    this.ws?.close();
    this.ready = false;
  }

  isConnected(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  applySettings(s: PocoSettings): void {
    this.send({ op: 'settings', settings: s });
  }

  perform(action: PocoAction): void {
    this.send({ op: 'perform', action });
  }

  stop(): void {
    this.send({ op: 'stop' });
  }

  askForSuggestion(): void {
    this.send({ op: 'suggest' });
  }

  setMusic(on: boolean, track?: string): void {
    this.send({ op: 'music', play: on, track });
  }

  holdStill(on: boolean): void {
    this.still = on;
    this.send({ op: 'still', on });
  }

  setInteracting(on: boolean, mode: PocoMode = 'social'): void {
    this.send({ op: 'interacting', on, mode });
  }

  onEvent(listener: (e: PocoEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
