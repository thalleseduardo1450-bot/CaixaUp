using System.IO;
using System.Text;

namespace CaixaUp.Instalador;

/// <summary>
/// O setup do NSIS é anexado ao fim deste executável por `empacotar.ps1`, com
/// um rodapé no final do arquivo:
///
///   [ bytes do setup ][ tamanho:8 ][ tamanho instalado:8 ][ versão:16 ][ "CXUPPKG1":8 ]
///
/// Anexar em vez de embutir como recurso mantém a compilação leve e evita
/// carregar 100+ MB na memória do compilador.
/// </summary>
internal sealed class Carga
{
    private const string Assinatura = "CXUPPKG1";
    private const int TamanhoVersao = 16;
    private const int TamanhoRodape = 8 + 8 + TamanhoVersao + 8;

    private readonly string _executavel;
    private readonly long _inicio;
    private readonly long _tamanho;

    public long TamanhoInstalado { get; }
    public string Versao { get; }

    private Carga(string executavel, long inicio, long tamanho, long tamanhoInstalado, string versao)
    {
        _executavel = executavel;
        _inicio = inicio;
        _tamanho = tamanho;
        TamanhoInstalado = tamanhoInstalado;
        Versao = versao;
    }

    public static Carga? LerDoProprioExecutavel()
    {
        try
        {
            var executavel = Environment.ProcessPath;
            if (string.IsNullOrEmpty(executavel)) return null;

            using var fluxo = File.OpenRead(executavel);
            if (fluxo.Length < TamanhoRodape) return null;

            fluxo.Seek(-TamanhoRodape, SeekOrigin.End);
            using var leitor = new BinaryReader(fluxo, Encoding.UTF8, leaveOpen: true);

            var tamanho = leitor.ReadInt64();
            var tamanhoInstalado = leitor.ReadInt64();
            var versao = Encoding.UTF8.GetString(leitor.ReadBytes(TamanhoVersao)).Trim('\0', ' ');
            var assinatura = Encoding.ASCII.GetString(leitor.ReadBytes(8));

            if (assinatura != Assinatura) return null;
            if (tamanho <= 0 || tamanho > fluxo.Length - TamanhoRodape) return null;

            var inicio = fluxo.Length - TamanhoRodape - tamanho;
            return new Carga(executavel, inicio, tamanho, tamanhoInstalado, versao);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Grava o setup num arquivo temporário e devolve o caminho.</summary>
    public string ExtrairSetup()
    {
        var pasta = Path.Combine(Path.GetTempPath(), "CaixaUp-Instalador");
        Directory.CreateDirectory(pasta);
        var destino = Path.Combine(pasta, $"CaixaUp-Setup-{Versao}.exe");

        using var origem = File.OpenRead(_executavel);
        origem.Seek(_inicio, SeekOrigin.Begin);

        using var saida = File.Create(destino);
        var buffer = new byte[1024 * 256];
        var restante = _tamanho;

        while (restante > 0)
        {
            var pedaco = (int)Math.Min(buffer.Length, restante);
            var lidos = origem.Read(buffer, 0, pedaco);
            if (lidos <= 0) throw new IOException("O pacote do CaixaUp está incompleto.");
            saida.Write(buffer, 0, lidos);
            restante -= lidos;
        }

        return destino;
    }
}

internal static class Medidas
{
    public static string Humana(long bytes)
    {
        if (bytes <= 0) return "0 MB";
        double valor = bytes;
        string[] unidades = ["B", "KB", "MB", "GB"];
        var indice = 0;
        while (valor >= 1024 && indice < unidades.Length - 1)
        {
            valor /= 1024;
            indice++;
        }
        return indice >= 2
            ? $"{valor:0.0} {unidades[indice]}"
            : $"{valor:0} {unidades[indice]}";
    }
}
