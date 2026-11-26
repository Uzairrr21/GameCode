Option Explicit

Dim shell, application, fileSystem, selected, executable

Set shell = CreateObject("WScript.Shell")
Set application = CreateObject("Shell.Application")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

Set selected = application.BrowseForFolder(0, "Select the project folder to open in GameCode.", 0, 0)
If selected Is Nothing Then WScript.Quit 0

executable = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "opencode-cli.exe")
If Not fileSystem.FileExists(executable) Then
  MsgBox "The GameCode terminal could not be found.", vbCritical, "GameCode"
  WScript.Quit 1
End If

shell.CurrentDirectory = selected.Self.Path
shell.Run Chr(34) & executable & Chr(34), 1, False
