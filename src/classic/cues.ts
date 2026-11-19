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
}

/** Layered friction, contact and resonance for objects at the table. */
export function playCue(voice: Instrument, name: string, at: number, amount = 1) {
  const count = Math.max(1, Math.min(12, Math.round(amount) || 1));
  const paper = (offset: number, length: number, from: number, to: number, gain: number) =>
    voice.rustle(at + offset, length, from, to, 0.95, gain);
  const knock = (offset: number, frequency: number, gain: number) => {
    voice.rustle(at + offset, 0.016, frequency * 8, frequency * 3, 0.72, gain, 'lowpass');
    voice.rustle(at + offset + 0.002, 0.047, frequency * 1.3, frequency, 0.85, gain * 0.72);
  };
  const metal = (offset: number, frequency: number, length: number, gain: number) => {
    voice.rustle(at + offset, 0.018, frequency * 4, frequency * 2, 1.4, gain * 1.5);
    voice.rustle(at + offset + 0.004, length, frequency * 1.1, frequency, 3.2, gain);
  };
  const body = (offset: number, frequency: number, length: number, gain: number) =>
    voice.rustle(at + offset, length, frequency * 4, frequency * 1.45, 0.78, gain, 'lowpass');
  const impact = (offset: number, frequency: number, length: number, gain: number) => {
    voice.rustle(at + offset, 0.02, 3500, 950, 0.8, gain * 1.2, 'lowpass');
    body(offset + 0.003, frequency, length, gain * 1.3);
  };

  switch (name) {
    case 'click':
      knock(0, 252, 0.11);
      break;
    case 'tick':
      paper(0, 0.022, 2400, 1200, 0.17);
      break;
    case 'click2':
      knock(0, 221, 0.18);
      knock(0.034, 297, 0.1);
      break;
    case 'draw':
      for (let i = 0; i < Math.min(count, 4); i++) {
        const offset = i * 0.105;
        paper(offset, 0.071, 3100 - 180 * i, 1120, 0.23);
        paper(offset + 0.014, 0.043, 4700, 1900, 0.1);
        knock(offset + 0.054, 192, 0.12);
      }
      break;
    case 'play':
      paper(0, 0.034, 1450, 2600, 0.14);
      impact(0.027, 126, 0.064, 0.27);
      paper(0.031, 0.039, 2600, 770, 0.15);
      if (count > 1) knock(0.057, 139, 0.16);
      break;
    case 'shuffle':
      for (let i = 0; i < 8; i++) {
        const offset = i * 0.018 + (i % 3) * 0.003 + (i >= 4 ? 0.077 : 0);
        paper(offset, 0.04, 3300 - i * 170, 1100, 0.19);
      }
      knock(0.267, 168, 0.21);
      body(0.267, 112, 0.086, 0.17);
      break;
    case 'flip':
      paper(0, 0.11, 1540, 3580, 0.15);
      paper(0.055, 0.093, 3600, 1210, 0.2);
      paper(0.101, 0.118, 2900, 730, 0.17);
      knock(0.168, 148, 0.23);
      metal(0.202, 840, 0.091, 0.13);
      knock(0.227, 106, 0.2);
      break;
    case 'skip':
      knock(0, 284, 0.16);
      paper(0.052, 0.065, 2550, 840, 0.15);
      break;
    case 'swap':
      paper(0, 0.087, 3500, 1250, 0.22);
      knock(0.076, 185, 0.14);
      paper(0.117, 0.097, 2000, 3000, 0.2);
      knock(0.205, 219, 0.11);
      break;
    case 'stack':
    case 'took':
      for (let i = 0; i < Math.min(6, 2 + Math.floor(count / 3)); i++) {
        const offset = i * 0.061;
        knock(offset, name === 'took' ? 182 - i * 9 : 148 + i * 13, 0.2);
        paper(offset + 0.009, 0.036, 1850, 700, 0.13);
      }
      impact(0.08, name === 'took' ? 62 : 99, 0.17, 0.31);
      break;
    case 'spin':
      for (let i = 0; i < 10; i++) {
        knock(0.019 * i + 0.0028 * i * i, i % 2 === 0 ? 272 : 184, 0.16);
      }
      break;
    case 'slotRatchet':
      voice.rustle(at, 0.014, 3100, 1700, 1.15, 0.15);
      voice.rustle(at + 0.004, 0.026, 1050, 440, 0.75, 0.17, 'lowpass');
      break;
    case 'reel': {
      const gear = Math.min(3, count);
      knock(0, 223 - gear * 21, 0.22);
      metal(0.014, 980 - gear * 130, 0.037, 0.09);
      break;
    }
    case 'slotLatch':
      body(0.019, 115, 0.083, 0.19);
      knock(0.046, 142, 0.24);
      paper(0.049, 0.049, 790, 340, 0.105);
      break;
    case 'chaos':
      voice.rustle(at, 0.22, 1800, 430, 0.74, 0.24, 'lowpass');
      [164, 230, 132].forEach((frequency, i) => knock(0.07 + i * 0.065, frequency, 0.22));
      impact(0.22, 66, 0.19, 0.31);
      break;
    case 'mult':
      knock(0, 138, 0.22);
      knock(0.059, 186 + count * 3, 0.17);
      body(0.06, 62, 0.21, 0.16);
      break;
    case 'lucky':
      metal(0, 619, 0.19, 0.09);
      knock(0.044, 215, 0.18);
      metal(0.084, 486, 0.16, 0.065);
      break;
    case 'coin':
      metal(0, 1300, 0.085, 0.11);
      metal(0.032, 1575, 0.067, 0.075);
      knock(0.071, 197, 0.12);
      break;
    case 'glass':
      [2280, 1730, 2960, 2140].forEach((f, i) => metal(i * 0.034, f, 0.18, 0.12 / (i + 1)));
      paper(0.015, 0.125, 5800, 2700, 0.12);
      break;
    case 'turn':
      knock(0, 194, 0.18);
      paper(0.025, 0.03, 2500, 1000, 0.085);
      break;
    case 'lastcall':
      [0, 0.28, 0.62].forEach((offset) => {
        knock(offset, 124, 0.22);
        metal(offset + 0.006, 139, 0.54, 0.13);
      });
      break;
    case 'bad':
      knock(0, 113, 0.22);
      knock(0.068, 99, 0.15);
      break;
    case 'bang':
      voice.rustle(at, 0.16, 2950, 270, 0.7, 0.39, 'lowpass');
      impact(0.006, 64, 0.26, 0.41);
      metal(0.021, 189, 0.19, 0.13);
      break;
    case 'ko':
    case 'devil':
      impact(0, 54, 0.3, 0.36);
      metal(0.065, name === 'devil' ? 233.1 : 174.6, 0.49, 0.14);
      voice.rustle(at + 0.096, 0.26, 1200, 290, 0.8, 0.17, 'lowpass');
      break;
    case 'win':
      knock(0, 134, 0.26);
      body(0.026, 56, 0.34, 0.22);
      paper(0.06, 0.18, 1750, 520, 0.15);
      break;
  }
}
