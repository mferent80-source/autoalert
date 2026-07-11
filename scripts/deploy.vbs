' Lansare deploy fara probleme de quoting (dublu-click pe acest fisier)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\deploy.bat"
sh.CurrentDirectory = dir
sh.Run "cmd.exe /c """ & bat & """", 1, True