// ============================================================
// Coletor v5 (via DOM do frame) - Portal de Niveis de Sinais
// nivel: niveis.virtua.com.br  |  console F12, contexto "top"
//
// Le o rightFrame assim que termina de carregar (sem segunda
// requisicao) e renderiza as secoes da tabela de sinais.
// Voce digita o CAPTCHA no formulario normal.
//
// Dados: window.__COLE = { total, itens[] }
// ============================================================
(function () {
  "use strict";

  var COLE = window.__COLE || { total: 0, itens: [] };
  window.__COLE = COLE;

  var pedindo = {};
  var capturado = {};
  var lastClean = 0;

  function txt(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function htmlEscape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cor(c) {
    return c === "verde" ? "#32cd32" : c === "amarelo" ? "#ffb90f" : c === "vermelho" ? "#ee4000" : "#dce6f2";
  }

  // ---------- Parsers ----------
  function parseBoxes(doc) {
    var nodes = doc.querySelectorAll(".boxTituloVerde,.boxTituloAmarelo,.divTituloCinza,.divItensCinza,.divSinaisVerde,.divSinaisAmarelo,.divSinaisVermelho");
    var groups = [], cur = null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], cls = n.className || "";
      if (cls.indexOf("boxTitulo") >= 0 || cls.indexOf("divTitulo") >= 0) {
        cur = { titulo: txt(n.textContent), labels: [], valores: [] };
        groups.push(cur);
      } else {
        if (!cur) { cur = { titulo: "", labels: [], valores: [] }; groups.push(cur); }
        if (cls.indexOf("divItens") >= 0) cur.labels.push(txt(n.textContent));
        else {
          var cc = cls.indexOf("Verde") >= 0 ? "verde" : cls.indexOf("Amarelo") >= 0 ? "amarelo" : cls.indexOf("Vermelho") >= 0 ? "vermelho" : "";
          cur.valores.push({ v: txt(n.textContent), cor: cc });
        }
      }
    }
    return groups.filter(function (g) { return g.labels.length || g.valores.length; });
  }

  // A tabela real usa: <tr><th colspan=5>Titulo da secao</th></tr>,
  // <tr><th class="titulo">colunas</th></tr>, <tr><td class="verde">valores</td></tr>.
  function parseTables(doc) {
    var out = [];
    var tables = doc.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var tb = tables[i];
      if (tb.querySelector("input, form, button")) continue;
      var secs = [];
      var cur = null;
      var trs = tb.querySelectorAll("tr");
      for (var k = 0; k < trs.length; k++) {
        var cols = trs[k].children;
        if (!cols.length) continue;
        var isTh = [].every.call(cols, function (c) { return c.tagName === "TH"; });
        if (isTh && cols.length === 1) {
          cur = { titulo: txt(cols[0].textContent), headers: [], rows: [] };
          secs.push(cur);
          continue;
        }
        if (!cur) { cur = { titulo: "", headers: [], rows: [] }; secs.push(cur); }
        if (isTh) {
          cur.headers = [].map.call(cols, function (c) { return txt(c.textContent); });
        } else {
          var row = [].map.call(cols, function (c) {
            return { t: txt(c.textContent), cls: c.className || "" };
          }).filter(function (cell) { return cell.t !== ""; });
          if (row.length) cur.rows.push(row);
        }
      }
      for (var s = 0; s < secs.length; s++) {
        var sec = secs[s];
        if (sec.rows.length) out.push(sec);
      }
    }
    return out;
  }

  function parseAlerts(doc) {
    var out = [];
    var scripts = doc.querySelectorAll("body script");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].textContent || "";
      var re = /alert\s*\(\s*["']([^"']*)["']\s*\)/g, m;
      while ((m = re.exec(s))) out.push(m[1]);
    }
    return out;
  }

  function parseResultado(doc) {
    return { boxes: parseBoxes(doc), tabelas: parseTables(doc), alertas: parseAlerts(doc) };
  }

  function contentIsResult(html) {
    return ["boxTitulo", "divSinais", 'th class="titulo"', "mensagem_erro", "td class="]
      .some(function (s) { return html.indexOf(s) >= 0; });
  }

  // ---------- Monitor de frames ----------
  function chave(u) { return u.pathname + u.search; }

  function registrar(u, html, ms) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var p = parseResultado(doc);
    var cod = u.searchParams.get("cod_cidade") || "";
    var mac = u.searchParams.get("mac") || "";
    COLE.total++;
    var item = {
      n: COLE.total,
      ts: new Date().toLocaleString("pt-BR"),
      cod: cod,
      mac: mac,
      url: u.toString(),
      duracaoMs: ms,
      boxes: p.boxes,
      tabelas: p.tabelas,
      alertas: p.alertas,
      html: html
    };
    COLE.itens.push(item);
    showResult(item);
    var ok = p.boxes.length || p.tabelas.length;
    console.log("[coletor] resultado" + (ok ? "" : " (sem dados)") + " em " + ms + "ms para", mac, item);
  }

  function monitor() {
    var agora = Date.now();
    if (agora - lastClean > 150000) {
      for (var k in capturado) if (agora - capturado[k] > 150000) delete capturado[k];
      lastClean = agora;
    }

    var frames = [];
    try { for (var i = 0; i < window.frames.length; i++) frames.push(window.frames[i]); }
    catch (e) { return; }

    for (var j = 0; j < frames.length; j++) {
      var f = frames[j];
      var loc;
      try { loc = f.location.href; } catch (e) { continue; }
      if (!loc || !/fr_direita\.php/i.test(loc)) continue;

      var u;
      try { u = new URL(loc, location.href); } catch (e) { continue; }
      if (!u.searchParams.get("mac") && !u.searchParams.get("cod_cidade")) continue;

      var key = chave(u);
      if (capturado[key]) continue;

      var d = f.document;
      var html = "";
      try { html = d && d.documentElement ? d.documentElement.outerHTML : ""; }
      catch (e) { continue; }

      var pronto = d && d.readyState === "complete";
      if (!pronto) {
        if (!pedindo[key]) pedindo[key] = agora;
        continue;
      }

      if (contentIsResult(html) || (pedindo[key] && agora - pedindo[key] > 45000)) {
        capturado[key] = agora;
        var ms = pedindo["__t_" + key] ? agora - pedindo["__t_" + key] : 0;
        delete pedindo[key];
        delete pedindo["__t_" + key];
        registrar(u, html, ms);
      } else if (!pedindo[key]) {
        pedindo[key] = agora;
        pedindo["__t_" + key] = agora;
      }
    }
  }

  setInterval(monitor, 1000);
  monitor();

  // ---------- Painel ----------
  function ensurePanel() {
    var d = document.getElementById("cole_panel");
    if (!d) {
      d = document.createElement("div");
      d.id = "cole_panel";
      d.style.cssText = "position:fixed;top:10px;right:10px;bottom:10px;width:440px;z-index:2147483000;" +
        "background:#0f1419;color:#dce6f2;font:12px/1.4 'Segoe UI',Arial,sans-serif;" +
        "border:1px solid #2e3a4a;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.5);overflow:auto;padding:0";
      d.innerHTML = '<div style="position:sticky;top:0;background:#1a222d;padding:10px;border-bottom:1px solid #2e3a4a;z-index:2">' +
        '<b style="color:#43a3ea">Coletor de Sinais</b>' +
        ' <span id="cole_total" style="color:#8aa0b8"></span>' +
        '<div style="margin-top:6px">' +
        '<button id="cole_export_json" style="margin-right:6px;padding:4px 10px;cursor:pointer;font-size:12px">Baixar JSON (tudo)</button>' +
        '<button id="cole_export_csv" style="margin-right:6px;padding:4px 10px;cursor:pointer;font-size:12px">Baixar CSV</button>' +
        '<button id="cole_copy_json" style="padding:4px 10px;cursor:pointer;font-size:12px">Copiar JSON</button>' +
        '</div></div><div id="cole_body" style="padding:10px">' +
        '<div style="color:#8aa0b8">Consulte no formulario da pagina. Quando o <code>fr_direita.php</code> terminar, os dados aparecem aqui.</div></div>';
      document.body.appendChild(d);
    }
    var t = d.querySelector("#cole_total");
    if (t) t.textContent = " - total: " + COLE.total;
    return d;
  }

  // ---------- Export ----------
  function baixar(nome, conteudo, mime) {
    var blob = new Blob([conteudo], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function exportarJson() {
    if (!COLE.itens.length) { alert("Nenhuma consulta capturada ainda."); return; }
    baixar("coletor_sinais_" + Date.now() + ".json", JSON.stringify(COLE, null, 2));
  }
  function exportarCsv() {
    if (!COLE.itens.length) { alert("Nenhuma consulta capturada ainda."); return; }
    function esc(c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }
    var linhas = ["n,ts,cod,mac,secao,indice,campo,valor,cor"];
    COLE.itens.forEach(function (it) {
      (it.tabelas || []).forEach(function (sec) {
        sec.rows.forEach(function (row) {
          var campos = sec.headers.length ? sec.headers : row.map(function (_, i) { return "v" + (i + 1); });
          row.forEach(function (cell, i) {
            linhas.push([it.n, it.ts, it.cod, it.mac, sec.titulo, i, campos[i] || "", cell.t, cell.cls]
              .map(esc).join(","));
          });
        });
      });
      (it.boxes || []).forEach(function (b) {
        b.valores.forEach(function (v, i) {
          linhas.push([it.n, it.ts, it.cod, it.mac, b.titulo, i, b.labels[i] || ("v" + (i + 1)), v.v, v.cor]
            .map(esc).join(","));
        });
      });
    });
    baixar("coletor_sinais_" + Date.now() + ".csv", linhas.join("\n"), "text/csv;charset=utf-8");
  }
  function copiarJson() {
    if (!COLE.itens.length) { alert("Nenhuma consulta capturada ainda."); return; }
    navigator.clipboard.writeText(JSON.stringify(COLE, null, 2))
      .then(function () { alert("JSON completo copiado. Total: " + COLE.total); });
  }
  function bindExport() {
    var p = document.getElementById("cole_panel");
    if (!p) return;
    var b1 = p.querySelector("#cole_export_json");
    var b2 = p.querySelector("#cole_export_csv");
    var b3 = p.querySelector("#cole_copy_json");
    if (b1) b1.addEventListener("click", exportarJson);
    if (b2) b2.addEventListener("click", exportarCsv);
    if (b3) b3.addEventListener("click", copiarJson);
  }

  function showResult(item) {
    var panel = ensurePanel();
    var body = panel.querySelector("#cole_body");
    var div = document.createElement("div");
    div.innerHTML = renderItem(item);
    body.insertBefore(div.firstChild, body.firstChild.nextSibling);
    var t = panel.querySelector("#cole_total");
    if (t) t.textContent = " - total: " + COLE.total;
  }

  function renderSecao(sec) {
    var s = '<div style="margin:8px 0"><div style="color:#fff;font-weight:700;font-size:13px;background:#43a3ea;padding:4px 8px;border-radius:4px">' +
            htmlEscape(sec.titulo || "Dados") + "</div>";
    // sem colunas: virou status/badges
    var primeira = sec.rows[0] || [];
    if (!sec.headers.length) {
      s += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">';
      sec.rows.forEach(function (row) {
        row.forEach(function (cell) {
          s += '<div style="min-width:90px;background:#0f1419;border:1px solid #2e3a4a;border-radius:6px;padding:8px;text-align:center;font-size:18px;font-weight:700;color:' + cor(cell.cls) + '">' +
               htmlEscape(cell.t) + "</div>";
        });
      });
      s += "</div>";
    } else if (sec.rows.length === 1) {
      // uma unica linha: grade de metricas com rotulos
      s += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">';
      sec.headers.forEach(function (h, i) {
        var cell = sec.rows[0][i];
        if (!cell) return;
        s += '<div style="min-width:100px;background:#0f1419;border:1px solid #2e3a4a;border-radius:6px;padding:6px 8px;text-align:center">' +
             '<div style="font-size:11px;color:#8aa0b8;text-transform:uppercase">' + htmlEscape(h) + "</div>" +
             '<div style="font-size:20px;font-weight:700;color:' + cor(cell.cls) + '">' + htmlEscape(cell.t) + "</div></div>";
      });
      s += "</div>";
    } else {
      s += '<table style="border-collapse:collapse;margin:6px 0;font-size:12px"><tr>' +
           sec.headers.map(function (h) { return '<th style="border:1px solid #2e3a4a;background:#212c39;color:#9cc3e8;padding:4px 8px">' + htmlEscape(h) + "</th>"; }).join("") +
           "</tr>";
      sec.rows.forEach(function (row) {
        s += "<tr>" + row.map(function (cell) {
          return '<td style="border:1px solid #2e3a4a;padding:4px 8px;text-align:center;color:' + (cell.cls ? cor(cell.cls) : "#dce6f2") + '">' + htmlEscape(cell.t) + "</td>";
        }).join("") + "</tr>";
      });
      s += "</table>";
    }
    s += "</div>";
    return s;
  }

  function renderItem(item) {
    var s = '<div style="margin:10px 0;padding:12px;border:1px solid #2e3a4a;border-radius:8px;background:#1a222d">';
    s += '<div style="font-size:12px;color:#8aa0b8">#' + item.n + " - " + htmlEscape(item.ts) +
         " - " + item.duracaoMs + "ms</div>";
    s += '<div style="font-size:12px;margin:4px 0;color:#dce6f2"><b>Cidade:</b> ' + htmlEscape(item.cod) +
         " &nbsp; <b>MAC:</b> " + htmlEscape(item.mac) + "</div>";
    if (item.alertas && item.alertas.length) {
      s += '<div style="color:#ffb4a8">' + item.alertas.map(htmlEscape).join("<br>") + "</div>";
    }
    item.boxes.forEach(function (b) {
      s += '<div style="margin:8px 0"><div style="color:#fff;font-weight:700;font-size:13px;background:#43a3ea;padding:4px 8px;border-radius:4px">' +
           htmlEscape(b.titulo || "Sinais") + "</div><div style='display:flex;flex-wrap:wrap;gap:8px;'>";
      b.valores.forEach(function (v, i) {
        var lb = b.labels[i] || "Item " + (i + 1);
        s += '<div style="min-width:110px;background:#0f1419;border:1px solid #2e3a4a;border-radius:6px;padding:6px 8px;text-align:center;margin-top:6px">' +
             '<div style="font-size:11px;color:#8aa0b8;text-transform:uppercase">' + htmlEscape(lb) + "</div>" +
             '<div style="font-size:20px;font-weight:700;color:' + cor(v.cor) + '">' + htmlEscape(v.v) + "</div></div>";
      });
      s += "</div></div>";
    });
    (item.tabelas || []).forEach(function (sec) { s += renderSecao(sec); });
    var json = JSON.stringify({ total: COLE.total, item: item }, null, 2);
    s += '<div style="margin-top:8px">' +
         '<button onclick="(function(){navigator.clipboard.writeText(' + JSON.stringify(json) +
         ").then(function(){alert('JSON copiado.')})})()\" " +
         'style="margin-right:6px;padding:5px 10px;cursor:pointer">Copiar JSON</button>' +
         '<button onclick="(function(){navigator.clipboard.writeText(' + JSON.stringify(item.html) +
         ").then(function(){alert('HTML bruto copiado.')})})()\" " +
         'style="padding:5px 10px;cursor:pointer">Copiar HTML bruto</button></div>';
    s += "</div>";
    return s;
  }

  ensurePanel();
  bindExport();
  console.log("[coletor] v5 ativo (DOM do rightFrame, secoes parseadas, export JSON/CSV). Total:", COLE.total);
  return COLE;
})();