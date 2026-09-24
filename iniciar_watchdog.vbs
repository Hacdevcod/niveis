' Inicia o watchdog do Afline Niveis de forma invisivel (2o plano).
' Roda no logon do Windows (pasta Inicializar) ou via start_online.cmd.
' Nao abre janela e nao depende dela para continuar rodando.
Set WShell = CreateObject("WScript.Shell")
WShell.Run """C:\Users\ADM\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"" ""C:\Users\ADM\Documents\Default Project\niveis-dash\watchdog.py""", 0, False