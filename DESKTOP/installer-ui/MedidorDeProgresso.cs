using System.IO;

namespace CaixaUp.Instalador;

/// <summary>
/// O NSIS em modo silencioso não informa progresso. Em vez de inventar uma
/// barra falsa, medimos a pasta de destino crescendo e comparamos com o
/// tamanho que o pacote deve ocupar — é o número real, com atraso de meio
/// segundo.
/// </summary>
internal sealed class MedidorDeProgresso : IDisposable
{
    private readonly string _pasta;
    private readonly long _alvo;
    private readonly CancellationTokenSource _parar = new();
    private Task? _tarefa;

    /// <summary>Percentual de 0 a 99 e bytes já copiados.</summary>
    public event Action<double, long>? Mudou;

    public MedidorDeProgresso(string pasta, long alvo)
    {
        _pasta = pasta;
        _alvo = alvo > 0 ? alvo : 1;
    }

    public void Iniciar()
    {
        _tarefa = Task.Run(async () =>
        {
            double ultimo = 0;

            while (!_parar.IsCancellationRequested)
            {
                var copiado = TamanhoDaPasta(_pasta);
                var percentual = Math.Min(99, copiado * 100.0 / _alvo);

                // A barra nunca anda para trás: o NSIS apaga e regrava arquivos.
                if (percentual > ultimo)
                {
                    ultimo = percentual;
                    Mudou?.Invoke(percentual, copiado);
                }

                try { await Task.Delay(400, _parar.Token); }
                catch (TaskCanceledException) { return; }
            }
        });
    }

    public void Parar()
    {
        _parar.Cancel();
        try { _tarefa?.Wait(TimeSpan.FromSeconds(2)); } catch { /* já encerrou */ }
    }

    private static long TamanhoDaPasta(string pasta)
    {
        try
        {
            if (!Directory.Exists(pasta)) return 0;

            long total = 0;
            foreach (var arquivo in Directory.EnumerateFiles(pasta, "*", SearchOption.AllDirectories))
            {
                try { total += new FileInfo(arquivo).Length; }
                catch { /* arquivo sendo escrito neste instante */ }
            }
            return total;
        }
        catch
        {
            // A pasta pode sumir e voltar durante a instalação.
            return 0;
        }
    }

    public void Dispose()
    {
        Parar();
        _parar.Dispose();
    }
}
