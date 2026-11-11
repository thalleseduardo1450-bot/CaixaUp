; Ganchos do instalador NSIS do CaixaUp (Tauri).
!include "FileFunc.nsh"

!macro NSIS_HOOK_PREINSTALL
  ; Quem vem da versão Electron (4.0.x): remove o programa antigo, em silêncio,
  ; antes de copiar o novo. Os dados ficam no Supabase; nada se perde.
  ${If} ${FileExists} "$INSTDIR\Uninstall CaixaUp.exe"
    DetailPrint "Removendo a versão antiga (Electron) do CaixaUp"
    ExecWait '"$INSTDIR\Uninstall CaixaUp.exe" /S /allusers _?=$INSTDIR'
    Delete "$INSTDIR\Uninstall CaixaUp.exe"
    RMDir /r "$INSTDIR\resources"
    RMDir /r "$INSTDIR\locales"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Faz o Windows trocar o ícone guardado em cache pelo atual.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; A atualização automática da versão Electron chama o instalador com --force-run:
  ; abre o CaixaUp novo ao terminar.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--force-run" $R1
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\CaixaUp.exe"'
  ${EndIf}
!macroend
