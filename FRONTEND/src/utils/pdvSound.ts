/**
 * Arquivo: src/utils/pdvSound.ts
 * Objetivo: emitir o bipe de confirmação de leitura sem depender de arquivo de áudio.
 * Entradas esperadas: nenhuma; apenas a chamada da tela quando um item entra ou é recusado.
 *
 * Usa WebAudio (oscilador) em vez de um .mp3 porque o PDV roda offline dentro do
 * Electron: nada de rede, nada de asset extra no build. Dois tons diferentes para
 * o operador distinguir SEM olhar a tela — que é o ponto de ter som no caixa.
 */

let audioContext: AudioContext | null = null;

/** Cria/reaproveita o contexto. Só depois do primeiro gesto do usuário ele toca. */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function tone(frequency: number, durationMs: number, gainValue: number): void {
  const context = getContext();
  if (!context) return;

  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    // Envelope curto: sem o ramp o corte seco vira um "clique" desagradável.
    const now = context.currentTime;
    const duration = durationMs / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    /* áudio indisponível: o PDV segue mudo, sem quebrar a venda */
  }
}

/** Bipe curto e agudo: item lançado com sucesso. */
export function playBeepSuccess(): void {
  tone(1180, 70, 0.09);
}

/** Bipe grave e mais longo: item recusado (sem estoque, código inexistente). */
export function playBeepError(): void {
  tone(320, 200, 0.11);
}

/** Toque de confirmação da venda finalizada (duas notas ascendentes). */
export function playSaleComplete(): void {
  tone(880, 110, 0.08);
  window.setTimeout(() => tone(1320, 160, 0.08), 110);
}
