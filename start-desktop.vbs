Option Explicit

Dim shell
Dim fso
Dim repoRoot
Dim launchScript
Dim splashPath
Dim splash
Dim command
Dim exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

repoRoot = fso.GetParentFolderName(WScript.ScriptFullName)
launchScript = fso.BuildPath(repoRoot, "scripts\launch-desktop-shell.ps1")
splashPath = fso.BuildPath(repoRoot, "scripts\desktop-launch-splash.hta")

shell.CurrentDirectory = repoRoot
If fso.FileExists(splashPath) Then
  Set splash = shell.Exec("mshta.exe " & Quote(splashPath))
  WScript.Sleep 200
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Quote(launchScript)
exitCode = shell.Run(command, 0, True)

On Error Resume Next
If Not splash Is Nothing Then
  splash.Terminate
End If
On Error GoTo 0

If exitCode <> 0 Then
  MsgBox "PromptCard Manager failed to start." & vbCrLf & _
    "Exit code: " & exitCode & vbCrLf & vbCrLf & _
    "Run start-desktop.bat to see the full startup output.", _
    vbExclamation, "PromptCard Manager"
End If

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
