// Where Poco's laptop is.
//
// Opened in Safari from the laptop's own dev server, the app could just connect
// back to whatever host served it. Installed as an app it loads from
// capacitor://localhost, so that trick is gone and it has to be told.
//
// Both cases are handled here so the same build works either way: served from
// the laptop it keeps working with no setup, installed it uses a stored host.
// The default is the laptop's Bonjour name rather than an IP, because IPs change
// every time the Wi-Fi hands out a new lease and a name does not.

const STORAGE_KEY = 'poco.server.v1';
/** The Python server's port: it serves the built app and the socket on one. */
export const SERVER_PORT = 8765;
const DEFAULT_PORT = SERVER_PORT;

/** The laptop's Bonjour name. Change this to whatever `scutil --get LocalHostName`
 *  prints on the machine running the server, or set it from the Connect step. */
export const DEFAULT_HOST = 'MacBook-Air-5.local';

/** True when running as an installed app rather than a page the laptop served. */
export function isInstalledApp(): boolean {
  const p = window.location.protocol;
  return p === 'capacitor:' || p === 'file:';
}

export function getServerHost(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_HOST;
  } catch {
    // Private browsing and cleared site data both throw rather than return null.
    return DEFAULT_HOST;
  }
}

export function setServerHost(host: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, host.trim());
  } catch {
    // Not worth failing a connection attempt over; it just won't be remembered.
  }
}

/** The WebSocket address to reach the Python server on. */
export function serverUrl(): string {
  if (!isInstalledApp() && window.location.hostname) {
    // Served by the laptop: connect back to it, whatever address was typed.
    // Note ws: not wss: - an HTTPS page cannot talk to ws:// on the LAN, which
    // is why the app is served over plain http from the laptop.
    return `ws://${window.location.hostname}:${DEFAULT_PORT}`;
  }
  const host = getServerHost();
  // A host with a port already in it wins, so someone can point at a tunnel.
  return host.includes(':') ? `ws://${host}` : `ws://${host}:${DEFAULT_PORT}`;
}
