using System.Windows;

// WinForms entra só pelo seletor de pasta; os tipos de tela são os do WPF.
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace CaixaUp.Instalador;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Um erro não tratado não pode virar a caixa de falha do .NET na cara
        // de quem só queria instalar um PDV.
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                $"A instalação encontrou um problema e foi encerrada.\n\n{args.Exception.Message}",
                "CaixaUp", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
            Shutdown(1);
        };
    }
}
