# Afline Niveis

Sistema de consulta de níveis de sinal do portal `niveis.virtua.com.br` (NET/Virtua), com dashboard web + backend Cloudflare Worker e app Android (APK).

## Estrutura

- `dash.html` — dashboard (tema dark, histórico local, exportação removida). Aberta via proxy local ou empacotada no APK.
- `proxy.py` — proxy local (porta 8777) que consulta o portal e devolve HTML real (sem CORS).
- `cloudflare/` — backend serverless:
  - `worker.js` — rotas `/captcha`, `/consulta`, `/resultado` (sessão do portal em cookie `afline_sess`) + estáticos de `public/`.
  - `wrangler.jsonc` — config do Worker (`afline-niveis`).
  - `public/` — dashboard estática hospedada junto ao Worker.
- `apk/` — projeto Android (sem Gradle; build manual com aapt/javac/d8/zipalign/apksigner):
  - `apk/android/build.ps1` — gera `Afline-Niveis.apk`; injeta a URL do Worker automl (via `worker_url.txt`, ignorado no git) no `js/config.js`.

## Deploy do Worker

Via GitHub Actions (`.github/workflows/deploy-worker.yml`) ao publicar em `main` com mudanças em `cloudflare/`. Requer secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Deploy manual também funciona:

```powershell
cd cloudflare
npm i -D wrangler
npx wrangler deploy
```

Após o deploy, a URL pública é `https://afline-niveis.<SUBDOMINIO>.workers.dev`.

## Build do APK

1. Colocar a URL real do Worker em `apk/android/worker_url.txt` (ex.: `https://afline-niveis.<SUBDOMINIO>.workers.dev`).
2. Rodar `apk/android/build.ps1`.
3. O APK gerado (`Afline-Niveis.apk` + cópia versionada `Afline-Niveis-1.x.apk`) aponta a dash para o Worker.

Requisitos: JDK 17 (`gps-jdk17`), Android SDK (`gps-sdk`, build-tools 35.0.0, android-35).

## Proxy local

```powershell
python proxy.py  # porta 8777
```

A dash carrega de `http://127.0.0.1:8777/` com `API_BASE` vazio (mesma origem).