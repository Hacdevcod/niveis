/**
 * Backend do sistema de consulta de Niveis (niveis.virtua.com.br) para
 * hospedagem estatica via Cloudflare Worker + Static Assets.
 *
 * Rotas:
 *   GET  /captcha               -> imagem freeCap (sessao salva em cookie)
 *   POST /consulta              -> POST no portal; devolve JSON {follow_url, alerts}
 *   GET  /resultado?url=<path>  -> GET na URL do portal; devolve {kind, html, alerts}
 *   demais                      -> servidos de ./public (dash estatica)
 *
 * Diferente do proxy local (que mantinha a sessao em memoria e fazia polling
 * no servidor), aqui a *sessao do portal fica em um cookie do cliente* e o
 * polling e feito pela dash no navegador — evita limites de CPU/tempo do
 * Worker e mantem uma sessao independente por usuario.
 */

const BASE = "http://niveis.virtua.com.br";
const SESS_COOKIE = "afline_sess";
const SESS_TTL = 60 * 60; // 1h
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) afline-dash";

function json(body, extra, origin) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  withCors(headers, origin);
  if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function withCors(headers, origin) {
  const from = origin || "";
  if (from) {
    // Origem pode ser "null" (WebView file://, dash em disco). Credentials:include
    // exige ACAO especifico + Allow-Credentials. Sem Origin (navegador/curl) cai para "*".
    headers.set("Access-Control-Allow-Origin", from);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Vary", "Origin");
}

function cookieName(c) {
  const i = c.indexOf("=");
  return i < 0 ? c.trim() : c.slice(0, i).trim();
}

function cookieValue(c) {
  const i = c.indexOf("=");
  return i < 0 ? "" : c.slice(i + 1).split(";")[0].trim();
}

function parseJar(s) {
  const jar = {};
  if (!s) return jar;
  for (const part of s.split(";")) {
    const name = cookieName(part);
    if (!name) continue;
    jar[name] = cookieValue(part);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

function setSess(response, jar, origin) {
  const val = cookieHeader(jar);
  // SameSite=None; Secure permite envio/gravar o cookie a partir de origens
  // "null" (WebView file:// do APK) e de outras origens com credentials:include.
  const cookie = `${SESS_COOKIE}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${SESS_TTL}`;
  response.headers.append("Set-Cookie", cookie);
  withCors(response.headers, origin);
  return response;
}

function mergeJar(baseJar, setCookieHeaders) {
  const jar = { ...baseJar };
  for (const c of setCookieHeaders || []) {
    const name = cookieName(c);
    const value = cookieValue(c);
    if (name) {
      if (value === "") delete jar[name];
      else jar[name] = value;
    }
  }
  return jar;
}

function bodyAlerts(html) {
  const i = html.toLowerCase().indexOf("<body");
  const bodyPart = i < 0 ? html : html.slice(html.indexOf(">", i) + 1);
  const out = [];
  for (const pat of [
    /alert\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /alert\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
  ]) {
    let m;
    while ((m = pat.exec(bodyPart))) out.push(m[1]);
  }
  return out;
}

function pageKind(html) {
  if (html.includes("boxTitulo") || html.includes("divSinais") || html.includes('th class="titulo"')) return "dados";
  if (html.includes("mensagem_erro")) return "erro";
  return "dica";
}

function extractBody(html) {
  const i = html.toLowerCase().indexOf("<body");
  if (i < 0) return html.trim();
  const j = html.indexOf(">", i);
  return j < 0 ? html : html.slice(j + 1).trim();
}

function findFollowUrl(a) {
  const m = a.match(/window\s*\.\s*open\s*\(\s*["']([^"']*fr_direita[^"']*)["']/i);
  if (m) return m[1].trim();
  if (a.includes("fr_direita.php")) return "fr_direita.php";
  return "";
}

async function upstream(method, path, data, jar) {
  const headers = { "User-Agent": UA, "Accept": "*/*" };
  const jarHeader = cookieHeader(jar);
  if (jarHeader) headers["Cookie"] = jarHeader;
  const opts = { method, headers, redirect: "follow" };
  if (data) {
    opts.body = new URLSearchParams(data).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const resp = await fetch(BASE + path, opts);
  const raw = await resp.arrayBuffer();
  const setCookies =
    typeof resp.headers.getSetCookie === "function" ? resp.headers.getSetCookie() : [];
  return { resp, raw, setCookies };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      const headers = new Headers({
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      withCors(headers, origin);
      return new Response(null, { status: 204, headers });
    }

    const reqCookie = request.headers.get("cookie") || "";
    let jar = {};
    for (const part of reqCookie.split(";")) {
      const name = cookieName(part);
      if (name === SESS_COOKIE) {
        try { jar = parseJar(decodeURIComponent(cookieValue(part))); } catch { jar = {}; }
        break;
      }
    }

    if (path === "/captcha" && request.method === "GET") {
      try {
        const { resp, raw, setCookies } = await upstream("GET", "/freecap/freecap.php", null, jar);
        jar = mergeJar(jar, setCookies);
        const ctype = resp.headers.get("Content-Type") || "image/png";
        return setSess(new Response(raw, {
          status: resp.status,
          headers: { "Content-Type": ctype, "Cache-Control": "no-store" },
        }), jar, origin);
      } catch (e) {
        return json({ error: "Erro ao obter captcha: " + e.message }, null, origin);
      }
    }

    if (path === "/consulta" && request.method === "POST") {
      try {
        const form = new URLSearchParams(await request.text());
        const data = {
          cod_cidade: form.get("cod_cidade") || "",
          mac: form.get("mac") || "",
          word: form.get("word") || "",
          btConsultar: "Consultar",
        };
        const { resp, raw, setCookies } = await upstream("POST", "/fr_esquerda.php", data, jar);
        jar = mergeJar(jar, setCookies);
        const text = new TextDecoder("utf-8").decode(raw);
        const alerts = bodyAlerts(text);
        const followUrl = findFollowUrl(text);
        return setSess(json({
          follow_url: followUrl,
          alerts: alerts,
          status: resp.status,
        }, null, origin), jar, origin);
      } catch (e) {
        return json({ error: "Erro na consulta: " + e.message }, null, origin);
      }
    }

    if (path === "/resultado" && request.method === "GET") {
      try {
        const target = (url.searchParams.get("url") || "").trim();
        if (!target) {
          return json({ kind: "erro", alerts: ["URL de resultado invalida."], html: "" }, null, origin);
        }
        const clean = target.startsWith("/") || /^[a-z]+:\/\//i.test(target) ? target : "/" + target;
        const path = clean.startsWith("/") ? clean : new URL(clean, BASE).pathname + new URL(clean, BASE).search;
        if (path.indexOf("fr_direita") < 0) {
          return json({ kind: "erro", alerts: ["URL de resultado fora do portal."], html: "" }, null, origin);
        }
        const { resp, raw, setCookies } = await upstream("GET", path, null, jar);
        jar = mergeJar(jar, setCookies);
        const text = new TextDecoder("utf-8").decode(raw);
        const kind = pageKind(text);
        if (kind === "dados") {
          return setSess(json({ kind, html: extractBody(text) || text, alerts: bodyAlerts(text) }, null, origin), jar, origin);
        }
        if (kind === "erro") {
          const alerts = bodyAlerts(text);
          const me = text.match(/<div[^>]*class="mensagem_erro"[^>]*>(.*?)<\/div>/is);
          if (me && me[1].trim()) {
            alerts.push(me[1].replace(/<[^>]+>/g, "").trim());
          }
          return setSess(json({ kind, alerts, html: "" }, null, origin), jar, origin);
        }
        return setSess(json({ kind: "dica", alerts: [], html: "" }, null, origin), jar, origin);
      } catch (e) {
        return json({ kind: "erro", alerts: ["Erro ao obter resultado: " + e.message], html: "" }, null, origin);
      }
    }

    // Entrada fixa: redireciona para o tunel vivo (URL dinâmica trocada pelo
    // watchdog). Se nao houver URL publicada, cai na dash estatica.
    if (path === "/" || path === "/index.html") {
      try {
        const r = await env.ASSETS.fetch(new URL("/live-url.txt", request.url));
        if (r && r.ok) {
          const t = (await r.text()).trim();
          if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/i.test(t)) {
            const dst = t.endsWith("/") ? t : t + "/";
            return Response.redirect(dst, 302);
          }
        }
      } catch (e) { /* segue para a dash estatica */ }
    }

    return env.ASSETS.fetch(request);
  },
};