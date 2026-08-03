!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ShotAI LAN 9090"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="ShotAI LAN 9090" dir=in action=allow program="$INSTDIR\ShotAI.exe" protocol=TCP localport=9090 profile=private enable=yes'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ShotAI LAN 9090"'
!macroend
