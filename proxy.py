#!/usr/bin/env python3
"""Proxy local da dash do Portal de Niveis (http://niveis.virtua.com.br).

Serve a dash em / e encaminha:
  GET  /captcha  -> imagem freeCap (mantem PHPSESSID na mesma sessao)
  POST /consulta -> form POST para /fr_esquerda.php (mesma sessao)

Uso: python proxy.py   (http://127.0.0.1:8777/)
"""

import re
import time
import threading
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote_plus, urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://niveis.virtua.com.br"
HOST = "127.0.0.1"
PORT = 8777
TIMEOUT = 25

DASH_HTML = Path(__file__).with_name("dash.html")
LOGO_IMG = Path(__file__).with_name("logo.jpg")
LOGO_PNG = Path(__file__).with_name("logo.png")

_jar = CookieJar()
_opener = build_opener(HTTPCookieProcessor(_jar))
_lock = threading.Lock()

_debug_log = Path(__file__).with_name("proxy_debug.log")


def _dbg(msg):
    try:
        with _debug_log.open("a", encoding="utf-8") as f:
            f.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), msg))
    except Exception:
        pass


def body_alerts(html):
    """Alertas executados de verdade: so os contidos no <body> (ignora as
    funcoes validaForm/new_freecap que ficam no <head>)."""
    body_part = html.split("<body", 1)
    if len(body_part) < 2:
        return []
    out = []
    for pat in (r'alert\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)', r"alert\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)"):
        out += re.findall(pat, body_part[1])
    return out


def inject_alerts(payload, alerts):
    if not alerts or "</body>" not in payload:
        return payload
    tags = ""
    for a in alerts:
        esc = a.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
        double = 'alert("%s")' % esc
        single = "alert('%s')" % a.replace("'", "\\'").replace("\n", " ")
        if double in payload or single in payload:
            continue
        tags += '<script type="text/javascript">%s;</script>' % double
    if not tags:
        return payload
    return payload.replace("</body>", tags + "</body>")


def strip_and_inject(html, alerts):
    """Remove os alert(...) originais do <body> e injeta a lista deduplicada
    (evita duplicata quando o servidor ja emite a mensagem)."""
    if not alerts:
        return html
    i = html.find("<body")
    head, body = (html[:i], html[i:]) if i >= 0 else ("", html)
    for a in alerts:
        body = body.replace('alert("' + a + '")', "")
        body = body.replace("alert('" + a + "')", "")
    return inject_alerts(head + body, alerts)


def page_kind(html):
    """Classifica a pagina do fr_direita:
    "dados" -> traz a tabela de sinais;
    "erro"  -> trada mensagem_erro;
    "dica"  -> pagina de dicas sem dados (id="pop"/informativo).
    A pagina de dicas tambem contem 'td class=' e por isso nao pode
    ser tratada como resultado (falso positivo comum)."""
    if any(s in html for s in ("boxTitulo", "divSinais", 'th class="titulo"')):
        return "dados"
    if "mensagem_erro" in html:
        return "erro"
    return "dica"


def extract_body(html):
    """Extrai o conteudo real a partir de <body ...> ate o FIM da string.
    O portal monta o <body> so com a 'Dica' e coloca as tabelas de dados
    DEPOIS de </body>/</html> (fora do body); parar no primeiro </body>
    descartava os sinais."""
    i = html.lower().find("<body")
    if i < 0:
        return html.strip()
    j = html.find(">", i)
    return html[j + 1:].strip() if j >= 0 else html


def upstream(method, path, data=None, referer=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dash-local",
        "Accept": "*/*",
    }
    if referer:
        headers["Referer"] = referer
    body = None
    if data is not None:
        body = urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = Request(BASE + path, data=body, headers=headers, method=method)
    with _lock:
        with _opener.open(req, timeout=TIMEOUT) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "text/html")
            return resp.status, ctype, raw


class Handler(BaseHTTPRequestHandler):
    server_version = "NiveisDash/1.0"

    def log_message(self, fmt, *args):
        print("[proxy] " + (fmt % args))

    def _send(self, code, ctype, payload, extra=None):
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, "text/html; charset=utf-8", DASH_HTML.read_text("utf-8"))
        elif path == "/logo":
            try:
                if LOGO_PNG.exists():
                    payload = LOGO_PNG.read_bytes()
                    ctype = "image/png"
                else:
                    payload = LOGO_IMG.read_bytes()
                    ctype = "image/jpeg"
                self._send(200, ctype, payload,
                           extra={"Cache-Control": "max-age=3600"})
            except OSError:
                self._send(404, "text/plain; charset=utf-8", "Logo nao encontrado")
        elif path == "/captcha":
            try:
                code, ctype, raw = upstream(
                    "GET", "/freecap/freecap.php", referer=BASE + "/fr_esquerda.php"
                )
                self._send(code, ctype or "image/png", raw)
            except (HTTPError, URLError, TimeoutError) as e:
                self._send(502, "text/plain; charset=utf-8", f"Erro ao obter captcha: {e}")
        else:
            self._send(404, "text/plain; charset=utf-8", "Not found")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/consulta":
            self._send(404, "text/plain; charset=utf-8", "Not found")
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length).decode("utf-8", "replace")
        fields = {}
        for pair in raw_body.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                fields[unquote_plus(k)] = unquote_plus(v)
        data = {
            "cod_cidade": fields.get("cod_cidade", ""),
            "mac": fields.get("mac", ""),
            "word": fields.get("word", ""),
            "btConsultar": "Consultar",
        }
        try:
            code, ctype, raw = upstream(
                "POST", "/fr_esquerda.php", data=data, referer=BASE + "/fr_esquerda.php"
            )
            a = raw.decode("utf-8", "replace")
            _dbg("POST cidade=%s mac=%s -> %s bytes, alertas_brutos=%r"
                 % (data["cod_cidade"], data["mac"], len(raw),
                    body_alerts(a)))
            alerts = body_alerts(a)

            # Ao processar o POST o portal faz window.open("fr_direita.php?cod_cidade=...&mac=...", "rightFrame");
            # os dados ficam nessa pagina (mesma sessao). Extraimos a URL completa dos parametros.
            extra_body = ""
            follow_url = None
            m = re.search(
                r'window\s*\.\s*open\s*\(\s*["\']([^"\']*fr_direita[^"\']*)["\']',
                a,
                re.I,
            )
            if m:
                follow_url = m.group(1).strip()
            elif "fr_direita.php" in a:
                follow_url = "fr_direita.php"
            if follow_url:
                _dbg("follow_url=%s" % follow_url)
                path = follow_url if follow_url.startswith("/") else "/" + follow_url
                # O servidor leva ~12s (as vezes mais) para disponibilizar o resultado.
                # A pagina de dicas ("dica") aparece enquanto o servidor processa ou
                # quando o MAC/cidade nao possui dados; continuamos no polling ate
                # aparecer a tabela real ("dados") ou mensagem_erro ("erro").
                sem_dados = True
                for attempt in range(16):
                    try:
                        _c2, _ct2, raw2 = upstream(
                            "GET", path, referer=BASE + "/fr_esquerda.php"
                        )
                    except (HTTPError, URLError, TimeoutError):
                        break
                    b = raw2.decode("utf-8", "replace")
                    if not b:
                        time.sleep(3)
                        continue
                    kind = page_kind(b)
                    _dbg("poll #%d: kind=%s len=%d" % (attempt, kind, len(raw2)))
                    if kind == "dados":
                        # A pagina de dados pode vir como fragmento (sem <body>);
                        # nesse caso extract_body devolve "" e os dados se perdem.
                        # Fallback: injeta o HTML cru.
                        extra_body = extract_body(b) or b
                        _dbg("extra_body=%d bytes (raw=%d)" % (len(extra_body), len(raw2)))
                        try:
                            Path(__file__).with_name("last_result.html").write_text(
                                b, encoding="utf-8", errors="replace"
                            )
                        except Exception:
                            pass
                        alerts += body_alerts(b)
                        sem_dados = False
                        break
                    if kind == "erro":
                        alerts += body_alerts(b)
                        _dbg("erro_page len=%d" % len(raw2))
                        try:
                            Path(__file__).with_name("last_erro.html").write_text(
                                b, encoding="utf-8", errors="replace"
                            )
                        except Exception:
                            pass
                        txt = ""
                        me = re.search(
                            r'<([a-z0-9]+)[^>]*class=["\'][^"\']*mensagem_erro[^"\']*["\'][^>]*>(.*?)</\1>',
                            b, re.S | re.I,
                        )
                        if me:
                            txt = re.sub(r"\s+", " ", me.group(2)).strip()
                        if not txt:
                            li = b.lower().find("mensagem_erro")
                            if li >= 0:
                                snippet = b[li + len("mensagem_erro"): li + 2500]
                                if "</div>" in snippet:
                                    snippet = snippet[: snippet.find("</div>")]
                                txt = re.sub(r"<[^>]+>", " ", snippet)
                                txt = re.sub(r"\s+", " ", txt).strip()
                        if txt:
                            alerts.append(txt)
                        if not alerts:
                            alerts.append(
                                "O portal retornou uma pagina de erro para a "
                                "consulta (cidade/MAC pode ser invalido ou fora "
                                "da area registrada). Verifique e tente de novo."
                            )
                        sem_dados = False
                        break
                    time.sleep(3)
                if sem_dados:
                    alerts.append(
                        "Consulta aceita, mas o portal nao retornou dados para "
                        "cidade/MAC informados (caso repita em seguida, aguarde o "
                        "cooldown de 45s)."
                    )

            # Devolve o formulario sem redirect e sem alerta: a consulta foi
            # engolida em silencio (cooldown ativo ou sessao de captcha invalida).
            if not follow_url and not alerts:
                alerts.append(
                    "Consulta nao executada: o portal devolveu o formulario sem "
                    "redirecionar nem alertar. Recarregue a imagem (CAPTCHA) e "
                    "tente novamente; repeticoes seguidas podem estar no "
                    "cooldown de 45s do portal."
                )

            if extra_body:
                a = a.replace(
                    "</body>",
                    '<div id="dash_extra" style="display:none">' + extra_body + "</div></body>",
                )

            seen = set()
            uniq = []
            for x in alerts:
                k = re.sub(r"[^A-Za-z0-9]", "", x).lower()
                if k and k not in seen:
                    seen.add(k)
                    uniq.append(x)
            text = strip_and_inject(a, uniq)

            if "text/html" not in ctype:
                ctype = "text/html; charset=utf-8"
            elif "charset" not in ctype:
                ctype += "; charset=utf-8"
            self._send(code, ctype, text.encode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as e:
            self._send(502, "text/plain; charset=utf-8", f"Erro na consulta: {e}")


def main():
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Dash rodando em http://{HOST}:{PORT}/  (Ctrl+C para parar)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")


if __name__ == "__main__":
    main()
