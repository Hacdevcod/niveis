' Auto-inicio do Afline Niveis (roda no logon via pasta Inicializar).
' 1) Watchdog invisivel: sobe proxy (8777) + tunnel publico + publica URL no Worker.
' 2) Painel grande estilo relogio de ponto (tkinter), aberto MINIMIZADO.
PYW = "C:\Users\ADM\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
DIR = "C:\Users\ADM\Documents\Default Project\niveis-dash"
Set WShell = CreateObject("WScript.Shell")
WShell.Run """" & PYW & """ """ & DIR & "\watchdog.py""", 0, False
WShell.Run """" & PYW & """ """ & DIR & "\painel_tk.py"" --minimized", 7, False