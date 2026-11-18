import * as THREE from 'three';
import { NAMES } from '../labels.ts';

interface Face {
  c: string;
  v: string;
  title?: string;
}
const palette: Record<string, string> = {
  r: '#962f29',
  y: '#764503',
  g: '#256344',
  b: '#244e8a',
  p: '#862d65',
  t: '#155d63',
  o: '#934319',
  v: '#594085',
  w: '#343847',
  x: '#353a3d',
};
const size = { width: 0.63, height: 0.88 };
export function cardStack(x: number, z: number) {
  const stack = new THREE.Group();
  stack.position.set(x, 0.97, z);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size.width, 0.085, size.height),
    new THREE.MeshStandardMaterial({ color: '#d5c9aa' }),
  );
  stack.add(body);
  const material = new THREE.MeshBasicMaterial();
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.height), material);
  faceMesh.rotation.x = -Math.PI / 2;
  faceMesh.position.y = 0.043;
  stack.add(faceMesh);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 448;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  material.map = texture;
  let last = '';
  return {
    stack,
    update(face: Face, side: 'L' | 'D') {
      const key = JSON.stringify([face, side]);
      if (key === last) return;
      last = key;
      context.fillStyle = side === 'D' ? '#dfe7ff' : '#fff4d7';
      context.fillRect(0, 0, 320, 448);
      context.fillStyle = palette[face.c] ?? palette.w;
      context.fillRect(14, 14, 292, 420);
      context.strokeStyle = '#fff6df';
      context.lineWidth = 2;
      context.strokeRect(25, 25, 270, 398);
      context.fillStyle = '#fffaf0';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const numeral = /^\d+$/.test(face.v);
      const title = face.title || NAMES.ru.values[face.v] || face.v;
      context.font = numeral ? '800 174px system-ui' : '700 40px system-ui';
      const words = title.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (line && context.measureText(next).width > 246) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
      lines.forEach((text, i) =>
        context.fillText(text, 160, 222 + (i - (lines.length - 1) / 2) * 49, 250),
      );
      context.font = '650 30px system-ui';
      context.fillText(NAMES.ru.colors[face.c] || '', 160, 380, 246);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
