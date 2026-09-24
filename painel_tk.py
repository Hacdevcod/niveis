#!/usr/bin/env python3
"""Painel grande estilo relogio de ponto do Afline Niveis.

Janela propria (tkinter) com hora gigante + status ao vivo do sistema
(proxy, OCR, tunel, url atual). Atualiza a cada 10s via /painelstatus.

Auto-inicio: lancado MINIMIZADO pelo iniciar_watchdog.vbs.
Uso manual: abrir_painel.cmd (maximizado).
"""

import json
import sys
import time
import tkinter as tk
import urllib.request

MINIMIZED = "--minimized" in sys.argv
BASE = "http://127.0.0.1:8777"
URL_FIXA = "https://afline-niveis.codw23.workers.dev/"

BG = "#0b0f14"
CARD = "#11161d"
LINE = "#1e2832"
FG = "#e8eef4"
DIM = "#9fb2c3"
OK = "#1fdf8f"
WARN = "#ffb020"
BAD = "#ff5560"
AZUL = "#7fd8ff"


def poll_status():
    try:
        with urllib.request.urlopen(BASE + "/painelstatus", timeout=5) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


class Painel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("AFLINE NIVIES - Monitor")
        self.configure(bg=BG)
        self.configure(background=BG)

        # Maximiza ao restaurar de minimizada (Tk nao tem evento Deiconify)
        self.bind("<Map>", lambda e: self.after(60, self._ensure_zoomed))
        if MINIMIZED:
            self.withdraw()
            self.state("iconic")
            self.after(300, lambda: self.state("iconic"))
        else:
            self.state("zoomed")

    def _ensure_zoomed(self):
        try:
            if self.state() != "iconic":
                self.state("zoomed")
        except Exception:
            pass

        self.hora_lbl = tk.Label(self, font=("Segoe UI", 150, "bold"),
                                 fg=FG, bg=BG, text="--:--:--")
        self.hora_lbl.pack(pady=(30, 0))
        self.data_lbl = tk.Label(self, font=("Segoe UI", 30), fg=DIM, bg=BG)
        self.data_lbl.pack()

        cards = tk.Frame(self, bg=BG)
        cards.pack(pady=25)
        self.c_sistema = self._card(cards, "SISTEMA")
        self.c_proxy = self._card(cards, "PROXY LOCAL (8777)")
        self.c_ocr = self._card(cards, "OCR / CAPTCHA")
        self.c_tunel = self._card(cards, "TUNEL PUBLICO")

        urls = tk.Frame(self, bg=BG)
        urls.pack()
        self.c_url = self._card(urls, "URL ATUAL DO TUNEL", 15)
        self.c_fixo = self._card(urls, "LINK FIXO (USE ESTE)", 15)

        self.upd_lbl = tk.Label(self,
                                text="AFLINE NIVIES - desenvolvido por Israelson Diego Rodrigues Sevalho",
                                font=("Segoe UI", 13), fg="#5f7284", bg=BG)
        self.upd_lbl.pack(side="bottom", pady=10)

        self.clk()
        self.refresh()
        self.after(1000, self.clk)
        self.after(10000, self.routine)

    def _card(self, parent, titulo, fonte=30):
        box = tk.Frame(parent, bg=CARD, highlightbackground=LINE, highlightthickness=1, padx=22, pady=12)
        box.pack(side="left", padx=8)
        tk.Label(box, text=titulo, font=("Segoe UI", 12, "bold"), fg="#7b8ea0",
                 bg=CARD).pack()
        lbl = tk.Label(box, text="...", font=("Segoe UI", fonte, "bold"), fg=FG, bg=CARD)
        lbl.pack()
        return lbl

    def clk(self):
        now = time.localtime()
        self.hora_lbl.config(text="%02d:%02d:%02d" % (now.tm_hour, now.tm_min, now.tm_sec))
        dias = ["Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira",
                "Sexta-feira", "Sabado", "Domingo"]
        meses = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
                 "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
        self.data_lbl.config(text="%s, %d de %s de %d"
                             % (dias[now.tm_wday], now.tm_mday,
                                meses[now.tm_mon - 1], now.tm_year))
        self.after(1000, self.clk)

    def refresh(self):
        s = poll_status()
        if s:
            tunel = bool(s.get("tunel_url"))
            ocr = bool(s.get("ocr"))
            self.c_proxy.config(text="ONLINE", fg=OK)
            self.c_ocr.config(text="ATIVO" if ocr else "INDISP.", fg=OK if ocr else WARN)
            self.c_tunel.config(text="ONLINE" if tunel else "INICIANDO",
                                fg=OK if tunel else WARN)
            if tunel and ocr:
                sistema, sc = "ONLINE", OK
            elif tunel:
                sistema, sc = "PARCIAL", WARN
            else:
                sistema, sc = "AQUECENDO", WARN
            self.c_sistema.config(text=sistema, fg=sc)
            self.c_url.config(text=s.get("tunel_url") or "aguardando URL...",
                              fg=AZUL if tunel else WARN)
        else:
            self.c_proxy.config(text="OFFLINE", fg=BAD)
            self.c_ocr.config(text="?", fg=BAD)
            self.c_tunel.config(text="?", fg=BAD)
            self.c_sistema.config(text="SEM PROXY", fg=BAD)
            self.c_url.config(text="sem conexao com o proxy local", fg=BAD)
        self.c_fixo.config(text=URL_FIXA, fg=AZUL)
        self.title("AFLINE NIVIES - Monitor  [%s]" % time.strftime("%H:%M:%S"))
        self.after(10000, self.routine)

    def routine(self):
        self.refresh()


if __name__ == "__main__":
    try:
        Painel().mainloop()
    except Exception:
        pass