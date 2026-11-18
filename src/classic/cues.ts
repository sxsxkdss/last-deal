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

/** Cardstock, felt and brass cues. Offsets are seconds from the cue's start. */
export function playCue(voice: Instrument, name: string, at: number, amount = 1) {
  const count = Math.max(1, Math.min(12, Math.round(amount) || 1));
  const paper = (offset: number, length: number, from: number, to: number, gain: number) =>
    voice.rustle(at + offset, length, from, to, 0.95, gain);
  const wood = (offset: number, frequency: number, gain: number) =>
    voice.strike(at + offset, frequency, 0.051, gain, [1, 2.48, 4.15]);
  const metal = (offset: number, frequency: number, length: number, gain: number) =>
    voice.strike(at + offset, frequency, length, gain, [1, 2.32, 3.91, 6.12]);
  const body = (offset: number, frequency: number, length: number, gain: number) =>
    voice.thump(at + offset, frequency, length, gain);

  switch (name) {
    case 'click':
      wood(0, 620, 0.075);
      paper(0.004, 0.027, 2200, 1200, 0.07);
      break;
    case 'tick':
      wood(0, 960, 0.062);
      break;
    case 'click2':
      wood(0, 365, 0.14);
      wood(0.042, 670, 0.095);
      break;
    case 'draw':
      for (let i = 0; i < Math.min(count, 4); i++) {
        const offset = i * 0.105;
        wood(offset, 290 + 22 * i, 0.085);
        paper(offset + 0.014, 0.095, 2700, 1100, 0.29);
      }
      break;
    case 'play':
      paper(0, 0.046, 1700, 4200, 0.16);
      body(0.041, 143, 0.091, 0.27);
      wood(0.043, 575, 0.15);
      if (count > 1) wood(0.077, 420, 0.09);
      break;
    case 'shuffle':
      for (let i = 0; i < 8; i++) {
        const offset = i * 0.021 + (i >= 4 ? 0.087 : 0);
        paper(offset, 0.04, 3300 - i * 170, 1100, 0.19);
      }
      wood(0.267, 320, 0.15);
      body(0.267, 112, 0.086, 0.17);
      break;
    case 'flip':
      paper(0, 0.14, 4900, 850, 0.26);
      wood(0.13, 320, 0.13);
      metal(0.152, 440, 0.33, 0.09);
      metal(0.23, 311, 0.39, 0.075);
      break;
    case 'skip':
      wood(0, 795, 0.12);
      paper(0.052, 0.065, 2550, 840, 0.15);
      break;
    case 'swap':
      paper(0, 0.087, 3500, 1250, 0.22);
      wood(0.076, 455, 0.095);
      paper(0.117, 0.097, 2000, 3000, 0.2);
      wood(0.205, 645, 0.075);
      break;
    case 'stack':
    case 'took':
      for (let i = 0; i < Math.min(6, 2 + Math.floor(count / 3)); i++) {
        const offset = i * 0.061;
        wood(offset, name === 'took' ? 425 - i * 27 : 365 + i * 34, 0.125);
        paper(offset + 0.009, 0.036, 1850, 700, 0.13);
      }
      body(0.08, name === 'took' ? 71 : 126, 0.17, 0.23);
      break;
    case 'spin':
      for (let i = 0; i < 10; i++) {
        wood(0.019 * i + 0.0028 * i * i, i % 2 === 0 ? 710 : 485, 0.085);
      }
      break;
    case 'reel':
      body(0, 128 - Math.min(3, count) * 12, 0.094, 0.15);
      metal(0.024, 590 + count * 46, 0.2, 0.11);
      break;
    case 'chaos':
      voice.rustle(at, 0.22, 1800, 430, 0.74, 0.24, 'lowpass');
      [385, 533, 305].forEach((frequency, i) => wood(0.07 + i * 0.065, frequency, 0.14));
      body(0.22, 81, 0.21, 0.21);
      break;
    case 'mult':
    case 'lucky':
      (name === 'mult' ? [392, 523.3, 698.5] : [587.3, 740, 880]).forEach((frequency, i) =>
        metal(i * 0.093, frequency + (name === 'mult' ? count * 9 : 0), 0.31, 0.1),
      );
      break;
    case 'coin':
      metal(0, 1190, 0.2, 0.13);
      metal(0.071, 1570, 0.24, 0.083);
      wood(0.135, 465, 0.083);
      break;
    case 'glass':
      [2280, 1730, 2960, 2140].forEach((f, i) => metal(i * 0.034, f, 0.18, 0.12 / (i + 1)));
      paper(0.015, 0.125, 5800, 2700, 0.12);
      break;
    case 'turn':
      wood(0, 392, 0.13);
      metal(0.081, 587.3, 0.2, 0.095);
      break;
    case 'lastcall':
      [293.7, 293.7, 220].forEach((frequency, i) => metal(i * 0.23, frequency, 0.39, 0.13));
      break;
    case 'bad':
      wood(0, 275, 0.16);
      body(0.067, 103, 0.12, 0.18);
      break;
    case 'bang':
      voice.rustle(at, 0.16, 2950, 270, 0.7, 0.39, 'lowpass');
      body(0.006, 79, 0.26, 0.37);
      wood(0.018, 250, 0.17);
      break;
    case 'ko':
    case 'devil':
      body(0, 71, 0.3, 0.31);
      metal(0.065, name === 'devil' ? 233.1 : 174.6, 0.49, 0.14);
      voice.rustle(at + 0.096, 0.26, 1200, 290, 0.8, 0.17, 'lowpass');
      break;
    case 'win':
      metal(0, 392, 0.4, 0.12);
      metal(0.106, 523.3, 0.44, 0.12);
      metal(0.212, 659.3, 0.55, 0.115);
      metal(0.212, 784, 0.46, 0.083);
      break;
  }
}
