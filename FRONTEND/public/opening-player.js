(() => {
  const video = document.querySelector('video');
  const bridge = window.caixaUpSplash;
  let began = false;
  let announced = false;
  let finished = false;

  function notify(state) {
    if (bridge) bridge.notify(state);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'caixaup-opening', state }, window.location.origin);
    }
  }

  function started() {
    if (announced) return;
    announced = true;
    document.body.classList.add('player-ready');
    notify('playing');
  }

  function end(state) {
    if (finished) return;
    finished = true;
    notify(state);
  }

  async function begin() {
    if (began) return;
    began = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.hidden = true;
      end('skipped');
      return;
    }
    try {
      video.muted = true;
      await video.play();
    } catch {
      video.hidden = true;
      end('failed');
    }
  }

  /* O botão do canto (ou Esc) encerra a abertura na hora. */
  const skip = document.getElementById('skip');

  function dismiss() {
    if (finished) return;
    try { video.pause(); } catch {}
    if (skip) skip.hidden = true;
    end('dismissed');
  }

  video.addEventListener('playing', started);
  video.addEventListener('ended', () => end('finished'));
  video.addEventListener('error', () => {
    video.hidden = true;
    end('failed');
  });
  if (skip) skip.addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });
  if (bridge) bridge.onPlay(begin);
  else void begin();
})();
