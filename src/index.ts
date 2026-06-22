import { OllamaDurableObject } from './ollama-do';

export interface Env {
  OLLAMA_LOCAL_URL: string;
  OLLAMA_DO: DurableObjectNamespace;
  MODEL_CONFIG: KVNamespace;
}

export { OllamaDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const id = env.OLLAMA_DO.idFromName('ollama-instance');
      const stub = env.OLLAMA_DO.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith('/api/')) {
      const id = env.OLLAMA_DO.idFromName('ollama-instance');
      const stub = env.OLLAMA_DO.get(id);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
