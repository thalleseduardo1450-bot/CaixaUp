; Instalação do CaixaUp — agora sem banco local.
; Os dados ficam no Supabase (nuvem); o app só precisa de internet.
; Chamado pelo template NSIS do electron-builder via nsis.include.
;
; Este arquivo é incluído ANTES do installer.nsi, então dá para definir o
; visual do MUI e as páginas próprias aqui.
;
; A ideia do desenho: branco, muito respiro, uma única cor de acento (o verde
; da marca) e tipografia maior que o padrão do NSIS. Sem sombra, sem gradiente,
; sem moldura — o que sobra é a marca e o texto.

!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define CX_ARTE "${BUILD_RESOURCES_DIR}\installer"

; Paleta da marca (BBGGRR nas chamadas do Windows, RRGGBB nos defines do MUI)
!define CX_NAVY      0x5F3A1E   ; #1E3A5F
!define CX_VERDE     0x81B910   ; #10B981
!define CX_CINZA     0x8B7464   ; #64748B
!define CX_BRANCO    0xFFFFFF

; ---------------------------------------------------------------- estilo ---
; Fundo branco em tudo: o cabeçalho do MUI some visualmente no restante.
!define MUI_BGCOLOR "FFFFFF"
!define MUI_INSTFILESPAGE_COLORS "64748B FFFFFF"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

; Esconde a faixa de cabeçalho do MUI (título, subtítulo, ícone e as linhas).
; Hidratar um id inexistente é inofensivo: GetDlgItem devolve 0 e ShowWindow
; sobre 0 não faz nada.
!macro CxEsconderCabecalho
  Push $0
  StrCpy $0 1034
  ${Do}
    Push $1
    GetDlgItem $1 $HWNDPARENT $0
    ShowWindow $1 ${SW_HIDE}
    Pop $1
    IntOp $0 $0 + 1
  ${LoopUntil} $0 > 1039
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_HIDE}
  Pop $0
!macroend

; Cria as fontes uma vez só. Segoe UI Light dá o ar "diferente do normal"
; sem precisar embutir arquivo de fonte no instalador.
!macro CxPrepararFontes
  ${If} $CxFonteTitulo == ""
    CreateFont $CxFonteTitulo "Segoe UI Light" "22" "400"
    CreateFont $CxFonteTexto  "Segoe UI"       "10" "400"
    CreateFont $CxFonteMiudo  "Segoe UI"       "9"  "400"
  ${EndIf}
!macroend

; O mesmo script é compilado duas vezes: uma para o instalador e outra para o
; desinstalador. Tudo daqui para baixo é só do instalador — sem a guarda, os
; defines de página vazam para o MUI_UNPAGE_WELCOME, que exige funções "un.".
!ifndef BUILD_UNINSTALLER

Var CxFonteTitulo
Var CxFonteTexto
Var CxFonteMiudo
Var CxDialogo
Var CxAceite
Var CxAceitou

; ------------------------------------------------------- página de boas-vindas
!macro customWelcomePage
  Page custom CxBoasVindasMostrar
!macroend

Function CxBoasVindasMostrar
  !insertmacro CxPrepararFontes

  nsDialogs::Create 1018
  Pop $CxDialogo
  ${If} $CxDialogo == error
    Abort
  ${EndIf}
  SetCtlColors $CxDialogo 0x000000 ${CX_BRANCO}
  !insertmacro CxEsconderCabecalho

  ; "Seja bem-vindo ao" — discreto, acima da marca
  ${NSD_CreateLabel} 0 22u 100% 12u "Seja bem-vindo ao"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $CxFonteTexto 1
  SetCtlColors $0 ${CX_CINZA} ${CX_BRANCO}
  ${NSD_AddStyle} $0 ${SS_CENTER}

  ; Marca (símbolo + "CaixaUp" em duas cores)
  ${NSD_CreateBitmap} 0 40u 100% 75u ""
  Pop $0
  ${NSD_SetStretchedImage} $0 "${CX_ARTE}\marca.bmp" $1

  ; Régua verde: o único acento da tela
  ${NSD_CreateBitmap} 0 124u 100% 2u ""
  Pop $0
  ${NSD_SetStretchedImage} $0 "${CX_ARTE}\acento.bmp" $1

  ${NSD_CreateLabel} 0 134u 100% 12u "Seu negócio. No seu ritmo."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $CxFonteMiudo 1
  SetCtlColors $0 ${CX_CINZA} ${CX_BRANCO}
  ${NSD_AddStyle} $0 ${SS_CENTER}

  nsDialogs::Show
FunctionEnd

; --------------------------------------------- pasta de instalação + termos
; A caixa de aceite entra na própria página de pasta, como no instalador que
; serviu de referência: uma tela a menos para o operador.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW CxPastaMostrar
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CxPastaSair
!define MUI_DIRECTORYPAGE_TEXT_TOP "Escolha onde o CaixaUp será instalado."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Pasta de instalação"

Function CxPastaMostrar
  !insertmacro CxPrepararFontes
  !insertmacro CxEsconderCabecalho

  ; Título próprio, já que o cabeçalho do MUI está escondido
  FindWindow $0 "#32770" "" $HWNDPARENT
  ${NSD_CreateLabel} 0 0u 100% 16u "Instalar o CaixaUp"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $CxFonteTitulo 1
  SetCtlColors $1 ${CX_NAVY} ${CX_BRANCO}

  ; Caixa de aceite dos termos
  ${NSD_CreateCheckbox} 0 -26u 100% 22u "Li e aceito os Termos de Uso e a Política de Privacidade."
  Pop $CxAceite
  SendMessage $CxAceite ${WM_SETFONT} $CxFonteMiudo 1
  SetCtlColors $CxAceite ${CX_CINZA} ${CX_BRANCO}
  ${NSD_OnClick} $CxAceite CxAceiteMudou

  Call CxAtualizarBotao
FunctionEnd

Function CxAceiteMudou
  Pop $0
  Call CxAtualizarBotao
FunctionEnd

; O botão "Próximo" só acende depois do aceite — igual à referência.
Function CxAtualizarBotao
  ${NSD_GetState} $CxAceite $CxAceitou
  GetDlgItem $0 $HWNDPARENT 1
  ${If} $CxAceitou == ${BST_CHECKED}
    EnableWindow $0 1
  ${Else}
    EnableWindow $0 0
  ${EndIf}
FunctionEnd

Function CxPastaSair
  ${NSD_GetState} $CxAceite $CxAceitou
  ${If} $CxAceitou != ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Para continuar, aceite os Termos de Uso e a Política de Privacidade."
    Abort
  ${EndIf}
FunctionEnd

!endif ; BUILD_UNINSTALLER

; ------------------------------------------------------------ instalando ---
!macro customInstall
  DetailPrint "CaixaUp instalado. Os dados ficam na nuvem (Supabase)."
!macroend
