<#
  Monta o instalador bonito do CaixaUp.

  Publica a tela WPF como arquivo único autocontido e anexa o setup NSIS do
  electron-builder no fim do .exe, com um rodapé que diz onde o pacote começa.

  Pré-requisito: o setup NSIS já ter sido gerado por gerar-instalador.cjs.

  Uso:
    powershell -ExecutionPolicy Bypass -File empacotar.ps1 -Versao 3.3.38
#>
param(
  [Parameter(Mandatory = $true)][string]$Versao
)

$ErrorActionPreference = "Stop"

$aqui     = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop  = Split-Path -Parent $aqui
$release  = Join-Path $desktop "release"
$setup    = Join-Path $release "CaixaUp-Setup-$Versao.exe"
$desempac = Join-Path $release "win-unpacked"
$destino  = Join-Path $release "CaixaUp-Instalador-$Versao.exe"

if (-not (Test-Path $setup)) {
  throw "Setup NSIS nao encontrado: $setup`nGere primeiro com: node gerar-instalador.cjs --version $Versao"
}

# Tamanho que a instalacao vai ocupar: usado para a barra de progresso real.
$tamanhoInstalado = 0
if (Test-Path $desempac) {
  $tamanhoInstalado = (Get-ChildItem $desempac -Recurse -File | Measure-Object -Property Length -Sum).Sum
}
if ($tamanhoInstalado -le 0) { $tamanhoInstalado = (Get-Item $setup).Length }

Write-Host "Publicando a tela WPF..."
$publicado = Join-Path $aqui "bin\publish"
if (Test-Path $publicado) { Remove-Item -Recurse -Force $publicado }

& dotnet publish (Join-Path $aqui "CaixaUpInstaller.csproj") `
    -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true `
    -o $publicado --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "dotnet publish falhou (codigo $LASTEXITCODE)." }

$exe = Join-Path $publicado "CaixaUp-Instalador.exe"
if (-not (Test-Path $exe)) { throw "Publicacao nao produziu $exe" }

Write-Host "Anexando o pacote do CaixaUp..."
Copy-Item $exe $destino -Force

$bytesSetup = (Get-Item $setup).Length

# Rodape: [tamanho:8][tamanho instalado:8][versao:16][assinatura:8]
$versaoBytes = New-Object byte[] 16
$texto = [System.Text.Encoding]::UTF8.GetBytes($Versao)
if ($texto.Length -gt 16) { throw "Versao longa demais para o rodape: $Versao" }
[Array]::Copy($texto, $versaoBytes, $texto.Length)

$saida = [System.IO.File]::Open($destino, 'Append', 'Write')
try {
  $origem = [System.IO.File]::OpenRead($setup)
  try { $origem.CopyTo($saida, 1MB) } finally { $origem.Dispose() }

  $escritor = New-Object System.IO.BinaryWriter($saida, [System.Text.Encoding]::UTF8, $true)
  try {
    $escritor.Write([int64]$bytesSetup)
    $escritor.Write([int64]$tamanhoInstalado)
    $escritor.Write($versaoBytes)
    $escritor.Write([System.Text.Encoding]::ASCII.GetBytes("CXUPPKG1"))
  } finally { $escritor.Dispose() }
} finally { $saida.Dispose() }

$final = Get-Item $destino
Write-Host ""
Write-Host "CONCLUIDO | CaixaUp $Versao"
Write-Host "Instalador: $($final.FullName)"
Write-Host ("Tamanho: {0:N1} MB (tela + pacote de {1:N1} MB)" -f ($final.Length / 1MB), ($bytesSetup / 1MB))
Write-Host ("Instalacao ocupara: {0:N1} MB" -f ($tamanhoInstalado / 1MB))
