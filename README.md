# CfOllama — Ollama Cloudflare Proxy

> Cloudflare Workers · TypeScript · Durable Objects · WebSocket · KV

Cloudflare Worker proxying Ollama API requests and WebSocket connections through a singleton
`OllamaDurableObject`. Enables multi-session Ollama access from the edge.

## Routing

| Path/Condition | Destination |
|---|---|
| `Upgrade: websocket` | `OllamaDurableObject` (WS session) |
| `/api/*` | `OllamaDurableObject` (REST) |
| `/health` | Inline health check |

## OllamaDurableObject

- `blockConcurrencyWhile` — session loading on startup
- Request body size guard: 2MB max
- Content-type enforcement: 415 on non-JSON POST
- `MODEL_CONFIG` KV — per-model configuration store

## Architecture

```
src/
├── index.ts       # Worker entry + routing + WS upgrade
└── ollama-do.ts   # OllamaDurableObject + session map
```
