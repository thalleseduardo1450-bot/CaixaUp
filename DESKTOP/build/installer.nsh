; Instalação do CaixaUp — agora sem banco local.
; Os dados ficam no Supabase (nuvem); o app só precisa de internet.
; Chamado pelo template NSIS do electron-builder via nsis.include.

!include "LogicLib.nsh"

!macro customInstall
  DetailPrint "CaixaUp instalado. Os dados ficam na nuvem (Supabase)."
!macroend
