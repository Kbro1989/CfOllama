# CfOllama

Run [Ollama](https://ollama.com/) behind [Cloudflare Workers](https://developers.cloudflare.com/workers/) and originate chat requests through a Durable Object / WebSocket bridge for methodology experiments with local inference.

Current local Ollama binary:
- path: `/mnt/c/Users/krist/ollama-cloudflare-worker/.env`
- status: redacted in git history

## Status

- Worker: `ollama-cloudflare-worker`
- Key files: `src/index.ts`, `src/ollama-do.ts`, `wrangler.toml`, `tsconfig.json`
- Last verified: TypeScript check passes; `wrangler dev` local runtime restart pending after WSL workerd review

## Quick start

```bash
npm install
npx wrangler dev
```

Requires Wrangler and Cloudflare account credentials configured.

## Push notes

- Remote: `https://github.com/Kbro1989/CfOllama.git`
- Use `git push -u origin main --force-with-lease` if the remote already has commits from the `Start coding with Codespaces` scaffold, otherwise `git push -u origin main` works after the first commit.

## License

MIT — educational/experimental use only.
