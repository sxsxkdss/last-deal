import metadata from './tracks/playlist.json';

type TrackInfo = { title?: string; artist?: string };
const overrides: Record<string, TrackInfo> = metadata;
const files = import.meta.glob<string>('./tracks/*.{mp3,ogg,wav,m4a,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const tracks = Object.entries(files)
  .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
  .map(([path, url]) => {
    const name = path.split('/').at(-1)!;
    return {
      url,
      title: overrides[name]?.title?.trim() || name.slice(0, name.lastIndexOf('.')),
      artist: overrides[name]?.artist?.trim(),
    };
  });

type Status = 'ready' | 'loading' | 'playing' | 'paused' | 'error';
interface Deck {
  element: HTMLAudioElement;
  gain: GainNode;
  index: number;
}

export function createMusic(context: AudioContext, update: () => void) {
  const output = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 20000;
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  output.connect(filter).connect(analyser).connect(context.destination);

  let selected = 0;
  let current: Deck | undefined;
  let incoming: Deck | undefined;
  let outgoing: Deck | undefined;
  let enabled = false;
  let status: Status = 'ready';
  let revision = 0;
  let fadeTimer = 0;
  let rate = 1;
  const unavailable = new Set<number>();
  const setStatus = (value: Status) => {
    status = value;
    update();
  };
  const step = (index: number, amount: number) => (index + amount + tracks.length) % tracks.length;

  function setGain(deck: Deck, value: number, seconds: number) {
    const now = context.currentTime;
    const gain = deck.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    deck.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  function release(deck: Deck | undefined) {
    if (!deck) return;
    deck.element.pause();
    deck.element.removeAttribute('src');
    deck.element.load();
    deck.gain.disconnect();
  }

  function skipFailed(index: number) {
    unavailable.add(index);
    for (let count = 1; count < tracks.length; count++) {
      const next = step(index, count);
      if (!unavailable.has(next)) {
        void select(next);
        return;
      }
    }
    setStatus('error');
  }

  function makeDeck(index: number) {
    const element = new Audio(tracks[index].url);
    element.preload = 'auto';
    element.preservesPitch = false;
    element.playbackRate = rate;
    const gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain).connect(output);
    const deck = { element, gain, index };
    element.addEventListener('timeupdate', () => {
      if (current !== deck || incoming || !enabled || tracks.length <= 1) return;
      const remaining = (element.duration - element.currentTime) / element.playbackRate;
      if (element.duration > 8 && remaining <= 3 && remaining > 0) {
        const next = step(index, 1);
        if (!unavailable.has(next)) void select(next, remaining);
      }
    });
    element.addEventListener('ended', () => {
      if (current !== deck || incoming || !enabled) return;
      void select(step(index, 1));
    });
    element.addEventListener('error', () => {
      if (current !== deck || incoming || !enabled || !element.error) return;
      skipFailed(index);
    });
    return deck;
  }

  async function select(index: number, fade = 0.6) {
    if (!tracks[index]) return;
    const token = ++revision;
    release(incoming);
    incoming = undefined;
    selected = index;
    if (!enabled) {
      release(current);
      current = undefined;
      setStatus('paused');
      return;
    }
    setStatus('loading');
    const deck = (incoming = makeDeck(index));
    try {
      await deck.element.play();
    } catch (error) {
      if (token !== revision) return;
      release(deck);
      incoming = undefined;
      if (error instanceof DOMException && error.name === 'NotAllowedError') setStatus('ready');
      else skipFailed(index);
      return;
    }
    if (token !== revision) return;
    window.clearTimeout(fadeTimer);
    release(outgoing);
    outgoing = current;
    current = deck;
    incoming = undefined;
    unavailable.delete(index);
    setGain(deck, 1, fade);
    if (outgoing) {
      const old = outgoing;
      setGain(old, 0, fade);
      fadeTimer = window.setTimeout(
        () => {
          release(old);
          if (outgoing === old) outgoing = undefined;
        },
        fade * 1000 + 100,
      );
    }
    setStatus('playing');
  }

  async function apply(shouldPlay: boolean) {
    if (!tracks.length) return;
    if (!shouldPlay) {
      enabled = false;
      window.clearTimeout(fadeTimer);
      revision++;
      release(incoming);
      release(outgoing);
      incoming = outgoing = undefined;
      if (current?.index !== selected) {
        release(current);
        current = undefined;
      }
      current?.element.pause();
      setStatus('paused');
      return;
    }
    enabled = true;
    if (
      incoming ||
      (current && !current.element.paused && !current.element.ended && status === 'playing')
    )
      return;
    unavailable.clear();
    if (!current || current.index !== selected || current.element.ended || current.element.error) {
      await select(selected);
      return;
    }
    const token = ++revision;
    try {
      await current.element.play();
      if (token === revision) setStatus('playing');
    } catch {
      if (token === revision) setStatus('ready');
    }
  }

  return {
    apply,
    move(amount: number) {
      if (!tracks.length) return;
      unavailable.clear();
      void select(step(selected, amount));
    },
    setVolume(volume: number) {
      output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) ** 2, context.currentTime, 0.07);
    },
    setNight(night: boolean) {
      const next = night ? 0.84 : 1;
      if (next === rate) return;
      rate = next;
      filter.frequency.setTargetAtTime(night ? 2600 : 20000, context.currentTime, 0.45);
      for (const deck of [current, incoming, outgoing]) if (deck) deck.element.playbackRate = rate;
    },
    get track() {
      return tracks[selected];
    },
    get status() {
      return status;
    },
    level() {
      if (status !== 'playing' || !current || current.element.paused) return null;
      analyser.getByteFrequencyData(bins);
      const hz = context.sampleRate / analyser.fftSize;
      let low = 0,
        count = 0,
        total = 0;
      for (let i = 0; i < bins.length; i++) {
        total += bins[i];
        if (i * hz > 30 && i * hz < 150) {
          low += bins[i];
          count++;
        }
      }
      return {
        bass: low / (count || 1) / 255,
        level: total / bins.length / 255,
        spec: bins,
        hz,
        lat: (context.outputLatency || 0) + (context.baseLatency || 0),
      };
    },
  };
}
