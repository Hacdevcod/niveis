#!/usr/bin/env python3
"""Watchdog do sistema Afline Niveis.

Mantem no ar:
  1) proxy local   (porta 8777)
  2) cloudflared   (tunel publico trycloudflare)
  3) publica a URL atual do tunel em cloudflare/public/live-url.txt
     -> o Worker (URL fixa) le esse arquivo e redireciona pra URL viva.

Uso:  python watchdog.py
A URL publica FIXA continua sendo https://afline-niveis.codw23.workers.dev/
(cerca de 40s depois de uma troca de URL ate o Worker atualizar).
"""

import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
TEMP = Path(os.environ.get("TEMP", r"C:\Users\ADM\AppData\Local\Temp"))
TUN = TEMP / "opencode" / "tun"
OUT = TUN / "out.log"
ERR = TUN / "err.log"
START_TUNNEL = TUN / "start_tunnel.cmd"
WATCHDOG_LOG = TUN / "watchdog.log"
LOCK = TUN / "watchdog.pid"

LIVE = BASE / "cloudflare" / "public" / "live-url.txt"
TOKEN_FILE = BASE / ".github_token"

POLL = 10
DETACHED = 0x00000008
NEW_GROUP = 0x00000200


def log(msg):
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        TUN.mkdir(parents=True, exist_ok=True)
        with WATCHDOG_LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def pid_alive(pid):
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "PID eq %d" % pid],
            capture_output=True, text=True, timeout=10,
        ).stdout
        return str(pid) in out
    except Exception:
        return False


def already_running():
    try:
        pid = int(LOCK.read_text().strip())
        if pid != os.getpid() and pid_alive(pid):
            return pid
    except Exception:
        pass
    return None


def port_up(port):
    try:
        with socket.create_connection(("127.0.0.1", port), 1.5):
            return True
    except Exception:
        return False


def start_proxy():
    log("proxy offline -> iniciando proxy.py")
    try:
        subprocess.Popen(
            [sys.executable, str(BASE / "proxy.py")],
            cwd=str(BASE),
            stdout=open(TUN / "proxy.log", "a"),
            stderr=subprocess.STDOUT,
            creationflags=DETACHED | NEW_GROUP,
            close_fds=True,
        )
    except Exception as e:
        log("erro ao iniciar proxy: %s" % e)


def tunnel_running():
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq cloudflared.exe"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        return "cloudflared.exe" in out
    except Exception:
        return False


def start_tunnel():
    log("cloudflared offline -> iniciando tunel")
    try:
        subprocess.Popen(
            ["cmd", "/c", str(START_TUNNEL)],
            creationflags=DETACHED | NEW_GROUP,
            close_fds=True,
        )
    except Exception as e:
        log("erro ao iniciar tunel: %s" % e)


def current_url():
    url = ""
    for f in (ERR, OUT):
        try:
            txt = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        m = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", txt, re.I)
        if m:
            url = m[-1]
    return url


def push():
    token = ""
    try:
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    if not token:
        log("sem .github_token -> URL salva so localmente")
        return
    remote = "https://Hacdevcod:%s@github.com/Hacdevcod/niveis.git" % token
    try:
        subprocess.run(["git", "add", "cloudflare/public/live-url.txt"],
                       cwd=str(BASE), check=False, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "watchdog: update live tunnel URL", "--",
             "cloudflare/public/live-url.txt"],
            cwd=str(BASE), check=False, capture_output=True,
        )
        r = subprocess.run(["git", "push", remote, "main"], cwd=str(BASE),
                           capture_output=True, text=True, timeout=60)
        if r.returncode == 0:
            log("push OK -> Worker atualiza em ~40s")
        else:
            log("push falhou: %s" % ((r.stderr or r.stdout) or "").strip()[:180])
    except Exception as e:
        log("push erro: %s" % e)


def publish(url):
    old = ""
    try:
        old = LIVE.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    if old == url:
        return
    try:
        LIVE.parent.mkdir(parents=True, exist_ok=True)
        LIVE.write_text(url + "\n", encoding="utf-8")
    except Exception as e:
        log("erro ao gravar live-url.txt: %s" % e)
        return
    log("URL do tunel atual -> %s" % url)
    push()


def main():
    other = already_running()
    if other:
        print("watchdog ja rodando (pid %d). Saindo." % other, flush=True)
        return
    TUN.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(str(os.getpid()))
    log("watchdog iniciado (pid %d): proxy 8777 + cloudflared + live-url" % os.getpid())
    try:
        while True:
            try:
                if not port_up(8777):
                    start_proxy()
                    time.sleep(3)
                if not tunnel_running():
                    start_tunnel()
                    time.sleep(18)
                url = current_url()
                if url:
                    publish(url)
                else:
                    log("aguardando URL do tunel...")
            except Exception as e:
                log("erro no loop: %s" % e)
            time.sleep(POLL)
    finally:
        try:
            if LOCK.exists() and LOCK.read_text().strip() == str(os.getpid()):
                LOCK.unlink()
        except Exception:
            pass


if __name__ == "__main__":
    main()
