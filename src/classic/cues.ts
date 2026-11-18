interface Instrument {
  rustle(
    at: number,
    length: number,
    from: number,
    to: number,
    resonance: number,
    gain: number,
    filter?: BiquadFilterType,
  ): void;
  strike(at: number, frequency: number, length: number, gain: number, partials?: number[]): void;
  thump(at: number, frequency: number, length: number, gain: number): void;
}

/** Short tabletop cues. Relative times are seconds from the cue's start. */
export function playCue(voice: Instrument, name: string, at: number, amount = 1) {
  const count = Math.max(1, Math.min(12, Math.round(amount) || 1));
  const paper = (offset: number, length: number, from: number, to: number, gain: number) =>
    voice.rustle(at + offset, length, from, to, 1.25, gain);
  const wood = (offset: number, frequency: number, gain: number) =>
    voice.strike(at + offset, frequency, 0.078, gain, [1, 1.93, 3.6]);
  const metal = (offset: number, frequency: number, length: number, gain: number) =>
    voice.strike(at + offset, frequency, length, gain, [1, 2.11, 4.27, 5.8]);
  const body = (offset: number, frequency: number, length: number, gain: number) =>
    voice.thump(at + offset, frequency, length, gain);

  switch (name) {
    case 'click':
      wood(0, 780, 0.065);
      break;
    case 'tick':
      wood(0, 1150, 0.047);
      break;
    case 'click2':
      wood(0, 480, 0.19);
      metal(0.028, 1290, 0.081, 0.07);
      break;
    case 'draw':
      for (let i = 0; i < Math.min(count, 4); i++) {
        const offset = i * 0.078;
        paper(offset, 0.082, 700, 3400, 0.25);
        wood(offset + 0.061, 470 + 27 * i, 0.042);
      }
      break;
    case 'play':
      paper(0, 0.026, 2800, 690, 0.28);
      body(0.003, 114, 0.1, 0.25);
      wood(0.006, 440, 0.12);
      if (count > 1) paper(0.049, 0.042, 1850, 710, 0.12);
      break;
    case 'shuffle':
      for (let i = 0; i < 9; i++) {
        paper(i * 0.031, 0.046, 1450 + i * 110, 2550, 0.17 + i * 0.008);
      }
      body(0.29, 104, 0.12, 0.15);
      break;
    case 'flip':
      paper(0, 0.175, 950, 4400, 0.22);
      paper(0.117, 0.12, 3400, 500, 0.2);
      wood(0.195, 335, 0.14);
      metal(0.205, 254, 0.37, 0.07);
      break;
    case 'skip':
      wood(0, 590, 0.14);
      wood(0.061, 395, 0.095);
      break;
    case 'swap':
      paper(0, 0.09, 1200, 3700, 0.19);
      paper(0.105, 0.11, 3400, 1150, 0.18);
      wood(0.201, 590, 0.067);
      break;
    case 'stack':
    case 'took':
      for (let i = 0; i < Math.min(6, 2 + Math.floor(count / 3)); i++) {
        wood(i * 0.047, 415 - i * 31, name === 'took' ? 0.14 : 0.12);
        paper(i * 0.047, 0.03, 2500, 930, 0.11);
      }
      body(0.077, name === 'took' ? 63 : 89, 0.21, 0.23);
      break;
    case 'spin':
      for (let i = 0; i < 11; i++) wood(0.046 * i, 560 + 32 * i, 0.06 + 0.004 * i);
      break;
    case 'reel':
      wood(0, 385 - Math.min(3, count) * 47, 0.19);
      metal(0.012, 925 + count * 31, 0.15, 0.087);
      break;
    case 'chaos':
      voice.rustle(at, 0.165, 580, 1700, 0.85, 0.24, 'lowpass');
      body(0.095, 68, 0.21, 0.22);
      [0.17, 0.246, 0.303, 0.356].forEach((offset, i) => wood(offset, 355 + i * 95, 0.11));
      break;
    case 'mult':
    case 'lucky':
      [570, 760, 950].forEach((f, i) =>
        metal(i * 0.075, f + (name === 'mult' ? count * 12 : 150), 0.28, 0.1),
      );
      break;
    case 'coin':
      metal(0, 1470, 0.21, 0.105);
      metal(0.071, 1150, 0.32, 0.088);
      break;
    case 'glass':
      [1490, 2020, 2870, 1900].forEach((f, i) => metal(i * 0.027, f, 0.24, 0.1 / (i + 1)));
      paper(0.02, 0.155, 4100, 2150, 0.085);
      break;
    case 'turn':
      wood(0, 494, 0.11);
      voice.strike(at + 0.09, 659, 0.28, 0.09, [1, 2.01]);
      break;
    case 'lastcall':
      [0, 0.25, 0.5].forEach((offset) => metal(offset, 348, 0.46, 0.12));
      break;
    case 'bad':
      wood(0, 247, 0.135);
      wood(0.075, 174, 0.1);
      break;
    case 'bang':
      voice.rustle(at, 0.22, 3700, 200, 0.7, 0.49, 'lowpass');
      body(0.004, 54, 0.29, 0.38);
      break;
    case 'ko':
    case 'devil':
      body(0, 63, 0.37, 0.34);
      metal(0.087, name === 'devil' ? 207 : 155, 0.44, 0.14);
      voice.rustle(at + 0.11, 0.22, 930, 310, 0.9, 0.14, 'lowpass');
      break;
    case 'win':
      [329.6, 415.3, 493.9, 659.3].forEach((frequency, i) =>
        voice.strike(at + i * 0.11, frequency, 0.57, 0.13, [1, 2.01, 3.66]),
      );
      metal(0.47, 1270, 0.4, 0.09);
      break;
  }
}
