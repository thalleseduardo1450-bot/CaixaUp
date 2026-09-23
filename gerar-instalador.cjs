const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');

const ROOT = __dirname;
const OFFICIAL_ICON = path.join(ROOT, 'DESKTOP', 'build', 'icon.png');

function validateVersion(value) {
  const version = String(value).trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      version.split('.').some(part => Number(part) > 65535)) {
    throw new Error('Use X.Y.Z, sem letras ou zeros extras: 3.3.35, 3.4.0 ou 4.0.0. Cada parte deve estar entre 0 e 65535.');
  }
  return version;
}

function validateIcon(file) {
  const png = fs.readFileSync(file);
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      png.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`A logo não é um PNG válido: ${file}`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== height || width < 256) throw new Error(`A logo precisa ser quadrada e ter pelo menos 256 x 256 pixels. Encontrado: ${width} x ${height}.`);
  return { width, height };
}

function createWindowsIcon(source, target) {
  const resizedPng = `${target}.png`;
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    '$sourceImage=[System.Drawing.Image]::FromFile($env:CAIXAUP_ICON_SOURCE)',
    '$bitmap=New-Object System.Drawing.Bitmap 256,256',
    '$graphics=[System.Drawing.Graphics]::FromImage($bitmap)',
    '$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '$graphics.DrawImage($sourceImage,0,0,256,256)',
    '$bitmap.Save($env:CAIXAUP_ICON_TARGET,[System.Drawing.Imaging.ImageFormat]::Png)',
    '$graphics.Dispose(); $bitmap.Dispose(); $sourceImage.Dispose()',
  ].join('; ');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    windowsHide: true, encoding: 'utf8', env: { ...process.env, CAIXAUP_ICON_SOURCE: source, CAIXAUP_ICON_TARGET: resizedPng },
  });
  if (result.status !== 0 || !fs.existsSync(resizedPng)) {
    throw new Error(`Não foi possível converter a logo para o formato do Windows. ${result.stderr || ''}`.trim());
  }
  try {
    const png = fs.readFileSync(resizedPng);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header[6] = 0;
    header[7] = 0;
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    fs.writeFileSync(target, Buffer.concat([header, png]));
  } finally {
    fs.rmSync(resizedPng, { force: true });
  }
}

function updateMetadata(packageData, lockData, version) {
  const pkg = structuredClone(packageData);
  const lock = structuredClone(lockData);
  pkg.version = version;
  pkg.productName = 'CaixaUp';
  pkg.build = { ...pkg.build, productName: 'CaixaUp', artifactName: 'CaixaUp-Setup-${version}.${ext}' };
  pkg.build.directories = { ...pkg.build.directories, output: 'release', buildResources: 'build' };
  pkg.build.win = { ...pkg.build.win, icon: 'build/icon.ico' };
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  return { pkg, lock };
}

function verifyArtifact(file, started) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < 1024 || stat.mtimeMs < started - 2000) {
    throw new Error(`O instalador está vazio ou não foi atualizado nesta execução: ${file}`);
  }
  const descriptor = fs.openSync(file, 'r');
  try {
    const signature = Buffer.alloc(2);
    fs.readSync(descriptor, signature, 0, 2, 0);
    if (signature.toString() !== 'MZ') throw new Error('O arquivo gerado não tem assinatura de executável Windows.');
  } finally { fs.closeSync(descriptor); }
  return stat;
}

function sha512Base64(file) {
  const hash = crypto.createHash('sha512');
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  const descriptor = fs.openSync(file, 'r');
  try {
    let read = 0;
    while ((read = fs.readSync(descriptor, buffer, 0, buffer.length)) > 0) hash.update(buffer.subarray(0, read));
  } finally { fs.closeSync(descriptor); }
  return hash.digest('base64');
}

/**
 * O electron-updater baixa o arquivo, confere tamanho e sha512 e o executa em
 * modo silencioso (/S). Por isso o feed aponta para o setup NSIS: o instalador
 * personalizado (WPF) ignora /S e abriria o assistente inteiro no meio da
 * atualização. O personalizado serve para a primeira instalação.
 */
function writeUpdateFeed(releaseDirectory, version, artifact) {
  const stat = fs.statSync(artifact);
  const name = path.basename(artifact);
  const hash = sha512Base64(artifact);
  const feed = [
    `version: ${version}`,
    'files:',
    `  - url: ${name}`,
    `    sha512: ${hash}`,
    `    size: ${stat.size}`,
    `path: ${name}`,
    `sha512: ${hash}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(releaseDirectory, 'latest.yml'), feed, 'utf8');
  return { name, hash, size: stat.size };
}

async function main() {
  let step = 'Conferir o projeto';
  let logFile;
  let backupDir;
  const originals = new Map();
  const started = Date.now();
  const say = message => {
    console.log(message);
    if (logFile) fs.appendFileSync(logFile, `${message}\n`);
  };
  const run = (label, args, cwd) => new Promise((resolve, reject) => {
    say(`\n${label}\nPasta: ${cwd}\nComando: npm ${args.join(' ')}\nAcompanhe abaixo. A primeira execução pode baixar arquivos e demorar alguns minutos.\n`);
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', data => { destination.write(data); fs.appendFileSync(logFile, data); });
    }
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${label} falhou (código ${code}). Consulte o log para identificar o erro.`)));
  });
  try {
    say('\nCAIXAUP | GERADOR DE INSTALADOR DO WINDOWS\n');
    say('Você escolhe a versão; o gerador aplica a logo, compila as telas e monta o instalador.');
    say('O instalador será salvo no computador. Esta operação não publica no GitHub e não instala o app.');
    say('Feche somente uma eventual compilação anterior. Não é necessário apagar dados ou desinstalar o CaixaUp.\n');
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 12)) throw new Error('Instale Node.js 22.12 ou superior.');
    const frontend = path.join(ROOT, 'FRONTEND');
    const desktop = path.join(ROOT, 'DESKTOP');
    const packageFile = path.join(desktop, 'package.json');
    const lockFile = path.join(desktop, 'package-lock.json');
    for (const file of [packageFile, lockFile, path.join(frontend, 'package.json'), path.join(frontend, 'package-lock.json')]) {
      if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório ausente: ${file}. Execute o gerador dentro do projeto completo.`);
    }
    const packageData = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    say(`Projeto: ${ROOT}\nNode.js: ${process.version}\nVersão atual: ${packageData.version}`);
    const versionIndex = process.argv.indexOf('--version');
    let version;
    if (versionIndex !== -1) version = validateVersion(process.argv[versionIndex + 1]);
    else {
      const input = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        while (!version) {
          const answer = await input.question(`\nQual será a versão do CaixaUp? Exemplo: ${packageData.version}\nDigite X.Y.Z (ou sair para cancelar): `);
          if (answer.trim().toLowerCase() === 'sair') { say('Operação cancelada. Nenhum arquivo foi alterado.'); return; }
          try { version = validateVersion(answer); } catch (error) { say(`[VERSÃO INVÁLIDA] ${error.message}`); }
        }
      } finally { input.close(); }
    }
    step = 'Validar a logo';
    const targetIcon = path.join(desktop, 'build', 'icon.png');
    const windowsIcon = path.join(desktop, 'build', 'icon.ico');
    const sourceIcon = fs.existsSync(OFFICIAL_ICON) ? OFFICIAL_ICON : targetIcon;
    if (sourceIcon !== OFFICIAL_ICON) say(`\nO caminho externo não existe: ${OFFICIAL_ICON}\nSerá usada a logo deste projeto: ${targetIcon}`);
    const dimensions = validateIcon(sourceIcon);
    say(`\nLogo: ${sourceIcon}\nResolução: ${dimensions.width} x ${dimensions.height}\nO gerador criará automaticamente o ícone do Windows em: ${windowsIcon}`);
    const release = path.join(desktop, 'release');
    const installer = path.join(release, `CaixaUp-Setup-${version}.exe`);
    const customInstaller = path.join(release, `CaixaUp-Instalador-${version}.exe`);
    say(`Instalador personalizado com animacao: ${customInstaller}`);
    say(`\nVersão escolhida: ${version}\nInstalador esperado: ${installer}`);
    if (process.argv.includes('--check')) { say('\nConferência concluída. Nenhum arquivo foi alterado e nenhuma compilação foi iniciada.'); return; }
    const logsDirectory = path.join(release, 'build-logs');
    fs.mkdirSync(logsDirectory, { recursive: true });
    backupDir = fs.mkdtempSync(path.join(logsDirectory, `${version}-`));
    logFile = path.join(backupDir, 'compilacao.log');
    say(`\nLog e cópias de segurança: ${backupDir}\nSe houver erro, o processo para e restaura a versão anterior dos metadados.`);
    for (const file of [packageFile, lockFile, targetIcon, windowsIcon]) {
      const original = fs.existsSync(file) ? fs.readFileSync(file) : null;
      originals.set(file, original);
      if (original) fs.writeFileSync(path.join(backupDir, path.basename(file)), original);
    }
    for (const file of [installer, customInstaller, `${installer}.blockmap`, path.join(release, 'latest.yml')]) {
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
    }
    step = '[1/6] Conferir ferramentas e dependências';
    await run(step, ['--version'], ROOT);
    for (const [directory, required] of [[frontend, ['typescript', 'vite']], [desktop, ['electron-builder']]]) {
      if (required.some(name => !fs.existsSync(path.join(directory, 'node_modules', name, 'package.json')))) {
        await run('Instalando dependências das versões registradas no projeto', ['ci', '--no-audit', '--no-fund'], directory);
      }
    }
    step = '[2/6] Aplicar versão e logo';
    say(`\n${step}`);
    const { pkg, lock } = updateMetadata(packageData, lockData, version);
    fs.mkdirSync(path.dirname(targetIcon), { recursive: true });
    if (path.resolve(sourceIcon).toLowerCase() !== path.resolve(targetIcon).toLowerCase()) fs.copyFileSync(sourceIcon, targetIcon);
    createWindowsIcon(targetIcon, windowsIcon);
    fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 4)}\n`);
    fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 4)}\n`);
    step = '[3/6] Compilar telas do CaixaUp';
    await run(step, ['run', 'build:desktop'], frontend);
    if (!fs.existsSync(path.join(frontend, 'dist', 'index.html'))) throw new Error('A compilação não produziu FRONTEND/dist/index.html.');
    step = '[4/6] Gerar instalador Windows';
    const packagingStarted = Date.now();
    await run(step, ['run', 'dist', '--', '--publish', 'never'], desktop);
    const stat = verifyArtifact(installer, packagingStarted);
    step = '[5/6] Gerar e validar instalador personalizado com animacao';
    const customStarted = Date.now();
    await run(step, ['run', 'installer:custom'], desktop);
    const customStat = verifyArtifact(customInstaller, customStarted);
    say(`\nINSTALADOR PERSONALIZADO: ${customInstaller}\nTamanho: ${(customStat.size / 1024 / 1024).toFixed(1)} MB\nUse este arquivo para a primeira instalacao na loja.`);
    step = '[6/6] Apontar a atualizacao automatica para o setup NSIS';
    const feed = writeUpdateFeed(release, version, installer);
    say(`\nAtualizacao automatica: ${path.join(release, 'latest.yml')}\nArquivo publicado: ${feed.name} (${feed.size} bytes)\nsha512: ${feed.hash}`);
    say(`\nCONCLUÍDO | CaixaUp ${version}\nInstalador: ${installer}\nTamanho: ${(stat.size / 1024 / 1024).toFixed(1)} MB\nTempo total: ${Math.ceil((Date.now() - started) / 1000)} segundos.`);
    say('Para instalar: feche o CaixaUp, abra o instalador e siga as instruções na tela.');
    say('Para publicar atualização automática: crie/edite a release do GitHub com a tag v' + version + ' e envie estes arquivos da mesma compilação:');
    say(`  1) ${installer}`);
    say(`  2) ${installer}.blockmap`);
    say(`  3) ${path.join(release, 'latest.yml')}`);
    say(`  4) ${customInstaller}  (opcional: para quem vai instalar pela primeira vez)`);
    say('O electron-updater confere tamanho e sha512 do arquivo baixado; enviar o latest.yml de outra compilação faz a atualização falhar.');
    say('Sem o setup NSIS e o blockmap na release, os clientes recebem 404 ao atualizar.');
    say(`Guarde o log caso precise de suporte: ${logFile}`);
  } catch (error) {
    for (const [file, original] of originals) {
      try {
        if (original) fs.writeFileSync(file, original);
        else if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (restoreError) { console.error(`Não foi possível restaurar ${file}: ${restoreError.message}`); }
    }
    say(`\nBUILD INTERROMPIDA\nEtapa: ${step}\nMotivo: ${error.message}`);
    say('Não use arquivos desta tentativa como uma nova versão. Corrija o erro indicado e execute o BAT novamente.');
    if (backupDir) say(`Cópias anteriores e diagnóstico: ${backupDir}`);
    process.exitCode = 1;
  }
}

module.exports = { validateVersion, validateIcon, updateMetadata, writeUpdateFeed, verifyArtifact };
if (require.main === module) void main();
