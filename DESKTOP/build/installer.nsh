; Instalação do CaixaUp — agora sem banco local.
; Os dados ficam no Supabase (nuvem); o app só precisa de internet.
; Chamado pelo template NSIS do electron-builder via nsis.include.

!include "LogicLib.nsh"

!macro customInstall
  ; Faz o Windows trocar o ícone antigo guardado em cache pelo logo novo.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  DetailPrint "CaixaUp instalado. Os dados ficam na nuvem (Supabase)."
!macroend
