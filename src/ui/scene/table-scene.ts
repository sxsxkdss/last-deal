import * as THREE from 'three';
import type { localGame } from '../../match/local.ts';
import { cardStack } from './cards.ts';
import { createRoom } from './room.ts';

type View = ReturnType<ReturnType<typeof localGame>['view']>;
type SceneView = Pick<View, 'seat' | 'side' | 'top' | 'nextBack' | 'canDraw'>;

export function createTableScene(onDraw: () => void) {
  const { scene, lamp, light } = createRoom();
  const deck = cardStack(-0.49, 0.16);
  const discard = cardStack(0.49, 0.22);
  scene.add(deck.stack, discard.stack);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 30);
  const eye = new THREE.Vector3(0, 2.55, 3.25);
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const lampEye = new THREE.Vector3(-0.86, 1.91, 0.87);
  const lampTarget = new THREE.Vector3(-1.42, 1.36, -0.55);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Стол в перспективе от первого лица');
  const host = document.createElement('section');
  host.className = 'table-scene';
  host.setAttribute('aria-label', 'Сцена Three.js');
  const controls = document.createElement('div');
  controls.className = 'scene-controls';
  const look = document.createElement('span');
  look.className = 'scene-hint';
  const lampSwitch = document.createElement('button');
  const inspectButton = document.createElement('button');
  lampSwitch.type = inspectButton.type = 'button';
  lampSwitch.textContent = 'Выключить лампу';
  inspectButton.textContent = 'Осмотреть лампу';
  lampSwitch.hidden = true;
  controls.append(look, lampSwitch, inspectButton);
  host.append(canvas, controls);

  let view: SceneView;
  let seat = -1,
    yaw = 0,
    pitch = -0.43,
    zoom = 0;
  let inspected = false,
    lampOn = true,
    frame = 0;
  let drag: { id: number; x: number; y: number; yaw: number; pitch: number; moved: boolean } | undefined;
  const clamp = THREE.MathUtils.clamp;

  function paint() {
    frame = 0;
    if (!host.isConnected || !view) return;
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.getSize(pointer);
    if (pointer.x !== width || pointer.y !== height) {
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1.35 ? 53 : 43;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    const next = inspected ? 1 : 0;
    zoom = Math.abs(zoom - next) < 0.005 ? next : THREE.MathUtils.lerp(zoom, next, 0.19);
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    target.copy(eye).addScaledVector(direction, 4.1).lerp(lampTarget, zoom);
    camera.position.copy(eye).lerp(lampEye, zoom);
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (zoom !== next) invalidate();
  }
  function invalidate() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function inspect(active: boolean) {
    inspected = active;
    host.dataset.inspect = String(active);
    inspectButton.textContent = active ? 'Вернуться к столу' : 'Осмотреть лампу';
    lampSwitch.hidden = !active;
    look.textContent = active
      ? 'Лампа · Esc для возврата'
      : 'Потяните мышью или пальцем, чтобы осмотреть стол';
    invalidate();
  }
  function toggleLamp() {
    lampOn = !lampOn;
    host.dataset.lamp = lampOn ? 'on' : 'off';
    lampSwitch.textContent = lampOn ? 'Выключить лампу' : 'Включить лампу';
    light(view.side === 'D', lampOn);
    invalidate();
  }
  function hit(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(inspected ? [lamp] : [deck.stack, lamp], true)[0]?.object;
  }
  function pointerDown(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw, pitch, moved: false };
  }
  function pointerMove(e: PointerEvent) {
    if (drag?.id !== e.pointerId || inspected) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) {
      yaw = clamp(drag.yaw - dx * 0.0035, -0.46, 0.46);
      pitch = clamp(drag.pitch + dy * 0.0035, -0.72, -0.26);
      invalidate();
    }
  }
  function pointerUp(e: PointerEvent) {
    if (drag?.id !== e.pointerId) return;
    const click = !drag.moved && e.target === canvas;
    drag = undefined;
    if (!click) return;
    const object = hit(e.clientX, e.clientY);
    if (object?.parent === lamp) {
      if (inspected && zoom === 1) toggleLamp();
      else inspect(true);
    } else if (!inspected && object?.parent === deck.stack && view.canDraw) onDraw();
  }
  function keyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && inspected && host.isConnected) {
      inspect(false);
      inspectButton.focus();
    }
  }
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  canvas.addEventListener('pointerdown', pointerDown, options);
  window.addEventListener('pointermove', pointerMove, options);
  window.addEventListener('pointerup', pointerUp, options);
  window.addEventListener(
    'pointercancel',
    () => {
      drag = undefined;
    },
    options,
  );
  document.addEventListener('keydown', keyDown, options);
  inspectButton.addEventListener('click', () => inspect(!inspected), options);
  lampSwitch.addEventListener('click', toggleLamp, options);
  const resize = new ResizeObserver(invalidate);
  resize.observe(host);
  host.dataset.lamp = 'on';
  inspect(false);
  return {
    host,
    update(next: SceneView) {
      if (seat !== next.seat) {
        seat = next.seat;
        yaw = 0;
        pitch = -0.43;
        zoom = 0;
        inspect(false);
      }
      view = next;
      host.dataset.side = view.side;
      deck.update(view.nextBack, view.side === 'L' ? 'D' : 'L');
      discard.update(view.top, view.side);
      light(view.side === 'D', lampOn);
      invalidate();
    },
    dispose() {
      listeners.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);
      deck.dispose();
      discard.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          object.material.dispose();
        }
      });
      renderer.dispose();
      host.remove();
    },
  };
}
