const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export class OllamaDurableObject {
  state: DurableObjectState;
  env: { OLLAMA_LOCAL_URL: string; MODEL_CONFIG: KVNamespace };

  sessions: Map<any, { ws: any; ready: boolean; lastMessageAt?: number }>;

  constructor(state: DurableObjectState, env: { OLLAMA_LOCAL_URL: string; MODEL_CONFIG: KVNamespace }) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();

    this.state.blockConcurrencyWhile(async () => {
      await this.loadSessions();
    });
  }

  async loadSessions(): Promise<void> {
    // Placeholder: restore persisted session metadata if needed.
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.acceptWebSocket(request);
    }

    const contentType = request.headers.get('content-type') || '';

    if (request.method === 'GET') {
      return new Response(JSON.stringify({ error: 'not_implemented', path: url.pathname }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'unsupported_content_type', received: contentType }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const raw = await request.text();

    if (raw.length > MAX_REQUEST_BYTES) {
      return new Response(JSON.stringify({ error: 'request_too_large', limit: MAX_REQUEST_BYTES }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'invalid_json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const active = this.activeSession();

    if (!active) {
      return this.proxyDirect(request, url, raw);
    }

    const session = active.ws;
    const messageId = crypto.randomUUID();

    const payload = JSON.stringify({
      messageId,
      path: url.pathname,
      body: parsed
    });

    try {
      session.send(payload);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'ws_send_failed', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(null, {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  acceptWebSocket(request: Request): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    (this.state as any).acceptWebSocket(server);
    this.bindSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: any, msg: any): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    session.ready = true;
    session.lastMessageAt = Date.now();

    const data = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
    const parsed = JSON.parse(data);

    if (typeof parsed === 'object' && parsed && 'messageId' in parsed && 'body' in parsed) {
      const responseKey = parsed.messageId;

      this.persistResponse(responseKey, parsed.body).catch(() => {
        // non-blocking persistence failure
      });
    }
  }

  async webSocketClose(ws: any): Promise<void> {
    this.unbindSession(ws);
  }

  private activeSession() {
    let latest: { ws: any; ready: boolean; lastMessageAt?: number } | undefined;
    for (const entry of this.sessions.values()) {
      if (!latest || (entry.lastMessageAt ?? 0) > (latest.lastMessageAt ?? 0)) {
        latest = entry;
      }
    }
    return latest && latest.ready ? { ws: latest.ws } : null;
  }

  private bindSession(ws: any): void {
    this.sessions.set(ws, { ws, ready: false });
  }

  private unbindSession(ws: any): void {
    this.sessions.delete(ws);
  }

  private async proxyDirect(request: Request, url: URL, body: string): Promise<Response> {
    const target = new URL(this.env.OLLAMA_LOCAL_URL);
    target.pathname = url.pathname;
    target.search = url.search;

    const upstream = new Request(target.toString(), {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Host': target.host
      }),
      body,
      redirect: 'manual'
    });

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstream);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'upstream_unavailable', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: this.sandboxHeaders(new Headers(upstreamResponse.headers))
    });
  }

  private sandboxHeaders(upstream: Headers): Headers {
    const blocked = new Set([
      'server',
      'x-powered-by',
      'access-control-allow-origin',
      'access-control-allow-headers',
      'access-control-allow-methods'
    ]);

    const out = new Headers({ 'X-Proxied-By': 'ollama-cloudflare-worker' });

    upstream.forEach((value: string, key: string) => {
      const lower = key.toLowerCase();
      if (blocked.has(lower) || lower === 'content-length') return;
      out.set(key, value);
    });

    return out;
  }

  private async persistResponse(messageId: string, body: any): Promise<void> {
    if (!this.env.MODEL_CONFIG) return;
    try {
      await this.env.MODEL_CONFIG.put(`resp:${messageId}`, JSON.stringify(body));
    } catch (err) {
      // best-effort cache
    }
  }
}
