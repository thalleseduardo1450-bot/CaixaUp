using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Animation;

// WinForms entra só pelo seletor de pasta; os tipos de tela são os do WPF.
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using MessageBoxResult = System.Windows.MessageBoxResult;

namespace CaixaUp.Instalador;

/// <summary>
/// Tela do instalador. Quem instala de fato é o setup NSIS embutido, rodado em
/// modo silencioso: assim o desinstalador, as entradas do Painel de Controle e
/// a atualização automática do electron-updater continuam valendo.
/// </summary>
public partial class Installer : Window
{
    private enum Etapa { BoasVindas, Pasta, Instalando, Pronto }

    private Etapa _etapa = Etapa.BoasVindas;
    private Carga? _carga;
    private string _destino = "";
    private bool _instalou;

    public Installer()
    {
        InitializeComponent();

        _carga = Carga.LerDoProprioExecutavel();
        Versao.Text = _carga is null ? "CaixaUp" : $"CaixaUp {_carga.Versao}";

        _destino = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "CaixaUp");
        CampoDestino.Text = _destino;
        AtualizarAvisoEspaco();

        Mostrar(Etapa.BoasVindas);
    }

    // ----------------------------------------------------------- navegação

    private void Mostrar(Etapa etapa)
    {
        _etapa = etapa;

        PainelBoasVindas.Visibility = etapa == Etapa.BoasVindas ? Visibility.Visible : Visibility.Collapsed;
        PainelPasta.Visibility      = etapa == Etapa.Pasta      ? Visibility.Visible : Visibility.Collapsed;
        PainelInstalando.Visibility = etapa == Etapa.Instalando ? Visibility.Visible : Visibility.Collapsed;
        PainelPronto.Visibility     = etapa == Etapa.Pronto     ? Visibility.Visible : Visibility.Collapsed;

        BotaoVoltar.Visibility = etapa == Etapa.Pasta ? Visibility.Visible : Visibility.Collapsed;

        BotaoAvancar.Content = etapa switch
        {
            Etapa.BoasVindas => "Próximo",
            Etapa.Pasta      => "Instalar",
            Etapa.Instalando => "Instalando…",
            _                => _instalou ? "Abrir o CaixaUp" : "Fechar",
        };

        BotaoAvancar.IsEnabled = etapa switch
        {
            Etapa.Pasta      => AceiteTermos.IsChecked == true,
            Etapa.Instalando => false,
            _                => true,
        };

        // Uma transição curta, só para a troca não ser seca. Nada além disso.
        var painel = etapa switch
        {
            Etapa.BoasVindas => (UIElement)PainelBoasVindas,
            Etapa.Pasta      => PainelPasta,
            Etapa.Instalando => PainelInstalando,
            _                => PainelPronto,
        };
        painel.BeginAnimation(OpacityProperty,
            new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180)));
    }

    private void Avancar(object sender, RoutedEventArgs e)
    {
        switch (_etapa)
        {
            case Etapa.BoasVindas:
                Mostrar(Etapa.Pasta);
                break;

            case Etapa.Pasta:
                _destino = CampoDestino.Text.Trim();
                if (!PastaValida(_destino))
                {
                    MessageBox.Show(this,
                        "Escolha uma pasta válida para a instalação.",
                        "CaixaUp", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                Mostrar(Etapa.Instalando);
                _ = InstalarAsync();
                break;

            case Etapa.Pronto:
                if (_instalou) AbrirAplicativo();
                Close();
                break;
        }
    }

    private void Voltar(object sender, RoutedEventArgs e) => Mostrar(Etapa.BoasVindas);

    private void AceiteMudou(object sender, RoutedEventArgs e)
    {
        if (_etapa == Etapa.Pasta)
            BotaoAvancar.IsEnabled = AceiteTermos.IsChecked == true;
    }

    private static bool PastaValida(string caminho)
    {
        if (string.IsNullOrWhiteSpace(caminho)) return false;
        try { return Path.IsPathFullyQualified(caminho); }
        catch { return false; }
    }

    private void EscolherPasta(object sender, RoutedEventArgs e)
    {
        using var dialogo = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Onde o CaixaUp será instalado",
            UseDescriptionForTitle = true,
            SelectedPath = Directory.Exists(_destino) ? _destino : CampoDestino.Text,
            ShowNewFolderButton = true,
        };

        if (dialogo.ShowDialog() == System.Windows.Forms.DialogResult.OK)
        {
            var escolhida = dialogo.SelectedPath;
            // Evita despejar o app solto dentro de uma pasta genérica.
            if (!escolhida.TrimEnd('\\').EndsWith("CaixaUp", StringComparison.OrdinalIgnoreCase))
                escolhida = Path.Combine(escolhida, "CaixaUp");

            CampoDestino.Text = escolhida;
            _destino = escolhida;
            AtualizarAvisoEspaco();
        }
    }

    private void AtualizarAvisoEspaco()
    {
        if (_carga is null) return;

        var necessario = Medidas.Humana(_carga.TamanhoInstalado);
        try
        {
            var raiz = Path.GetPathRoot(CampoDestino.Text);
            if (!string.IsNullOrEmpty(raiz))
            {
                var livre = new DriveInfo(raiz).AvailableFreeSpace;
                AvisoEspaco.Text = $"Espaço necessário: {necessario}   ·   livre neste disco: {Medidas.Humana(livre)}";
                return;
            }
        }
        catch { /* disco sem resposta: mostra só o necessário */ }

        AvisoEspaco.Text = $"Espaço necessário: {necessario}";
    }

    // ---------------------------------------------------------- instalação

    private async Task InstalarAsync()
    {
        if (_carga is null)
        {
            Falhar("O instalador está incompleto: o pacote do CaixaUp não foi encontrado.");
            return;
        }

        string setup;
        try
        {
            DetalheInstalando.Text = "Preparando os arquivos…";
            setup = await Task.Run(() => _carga.ExtrairSetup());
        }
        catch (Exception erro)
        {
            Falhar($"Não foi possível preparar a instalação.\n\n{erro.Message}");
            return;
        }

        DetalheInstalando.Text = "Copiando o CaixaUp para o seu computador…";

        using var medidor = new MedidorDeProgresso(_destino, _carga.TamanhoInstalado);
        medidor.Mudou += (percentual, copiado) => Dispatcher.Invoke(() =>
        {
            Barra.Value = percentual;
            Porcentagem.Text = $"{percentual:0}%";
            Medida.Text = $"{Medidas.Humana(copiado)} de {Medidas.Humana(_carga.TamanhoInstalado)}";
        });
        medidor.Iniciar();

        int codigo;
        try
        {
            codigo = await ExecutarSetupAsync(setup, _destino);
        }
        catch (Exception erro)
        {
            medidor.Parar();
            Falhar($"A instalação não pôde ser concluída.\n\n{erro.Message}");
            return;
        }
        finally
        {
            try { File.Delete(setup); } catch { /* o Windows limpa o temporário depois */ }
        }

        medidor.Parar();

        if (codigo != 0)
        {
            Falhar($"A instalação foi interrompida (código {codigo}). Nenhuma alteração foi mantida.");
            return;
        }

        Barra.Value = 100;
        Porcentagem.Text = "100%";
        Medida.Text = Medidas.Humana(_carga.TamanhoInstalado);

        _instalou = true;
        DetalhePronto.Text = $"O CaixaUp {_carga.Versao} foi instalado em\n{_destino}";
        Mostrar(Etapa.Pronto);
    }

    /// <summary>
    /// `/S` roda o NSIS sem telas; `/D=` precisa ser o último argumento e não
    /// aceita aspas — o NSIS lê o resto da linha como caminho.
    /// </summary>
    private static Task<int> ExecutarSetupAsync(string setup, string destino)
    {
        var fim = new TaskCompletionSource<int>();

        var processo = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = setup,
                Arguments = $"/S /D={destino.TrimEnd('\\')}",
                UseShellExecute = false,
                CreateNoWindow = true,
            },
            EnableRaisingEvents = true,
        };

        processo.Exited += (_, _) =>
        {
            var codigo = processo.ExitCode;
            processo.Dispose();
            fim.TrySetResult(codigo);
        };

        processo.Start();
        return fim.Task;
    }

    private void Falhar(string mensagem)
    {
        _instalou = false;
        TituloPronto.Text = "Não deu certo";
        DetalhePronto.Text = mensagem;
        Mostrar(Etapa.Pronto);
    }

    private void AbrirAplicativo()
    {
        var exe = Path.Combine(_destino, "CaixaUp.exe");
        if (!File.Exists(exe)) return;

        try
        {
            Process.Start(new ProcessStartInfo { FileName = exe, UseShellExecute = true })?.Dispose();
        }
        catch { /* o atalho na área de trabalho continua valendo */ }
    }

    // --------------------------------------------------------- barra/janela

    private void ArrastarJanela(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left) DragMove();
    }

    private void Minimizar(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void Fechar(object sender, RoutedEventArgs e)
    {
        if (_etapa == Etapa.Instalando)
        {
            var resposta = MessageBox.Show(this,
                "A instalação está em andamento. Fechar agora pode deixar o CaixaUp pela metade.\n\nDeseja fechar mesmo assim?",
                "CaixaUp", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (resposta != MessageBoxResult.Yes) return;
        }
        Close();
    }
}
