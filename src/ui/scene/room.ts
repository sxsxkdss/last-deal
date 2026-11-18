import * as THREE from 'three';

export function createRoom() {
  const scene = new THREE.Scene();
  const box = (
    width: number,
    height: number,
    depth: number,
    color: string,
    x: number,
    y: number,
    z: number,
    metalness = 0,
  ) => {
    const object = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.57 }),
    );
    object.position.set(x, y, z);
    return object;
  };
  const wood = '#533526';
  scene.add(box(14, 0.12, 12, '#282727', 0, -0.1, 0), box(14, 6, 0.14, '#36363b', 0, 2, -4));
  scene.add(box(4.9, 0.19, 2.95, wood, 0, 0.82, 0), box(4.65, 0.03, 2.68, '#235946', 0, 0.926, 0));
  for (const x of [-2, 2])
    for (const z of [-1.05, 1.05]) scene.add(box(0.21, 0.82, 0.21, wood, x, 0.4, z));
  scene.add(box(1.04, 0.12, 0.78, wood, 0, 0.49, -2.22), box(1.04, 0.65, 0.11, wood, 0, 0.84, -2.66));
  scene.add(box(0.82, 0.46, 0.065, '#344346', 0, 0.89, -2.59));
  for (const x of [-0.42, 0.42])
    for (const z of [-2.53, -1.94]) scene.add(box(0.1, 0.49, 0.1, wood, x, 0.24, z));
  scene.add(box(1.13, 0.012, 0.6, '#1b3931', 0, 0.946, -0.91));
  const lamp = new THREE.Group();
  lamp.position.set(-1.42, 0.945, -0.55);
  const metal = new THREE.MeshStandardMaterial({ color: '#9c7443', metalness: 0.55, roughness: 0.44 });
  const cylinder = (top: number, bottom: number, height: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 32), metal);
    mesh.position.y = y;
    lamp.add(mesh);
  };
  cylinder(0.24, 0.27, 0.08, 0.04);
  cylinder(0.045, 0.067, 0.62, 0.35);
  cylinder(0.15, 0.35, 0.28, 0.77);
  lamp.add(box(0.13, 0.07, 0.085, '#222124', 0.12, 0.095, 0.11, 0.3));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 12),
    new THREE.MeshBasicMaterial({ color: '#ffe1a1' }),
  );
  bulb.position.y = 0.63;
  lamp.add(bulb);
  scene.add(lamp);
  const ambient = new THREE.HemisphereLight();
  const fill = new THREE.DirectionalLight();
  fill.position.set(1.7, 4, 2.5);
  const lampLight = new THREE.PointLight('#ffbe73', 3.5, 4, 2);
  lampLight.position.set(lamp.position.x, 1.5, lamp.position.z);
  scene.add(ambient, fill, lampLight);
  return {
    scene,
    lamp,
    light(night: boolean, on: boolean) {
      scene.background = new THREE.Color(night ? '#161c2c' : '#34302b');
      ambient.color.set(night ? '#9eafff' : '#fff3df');
      ambient.groundColor.set(night ? '#293553' : '#736155');
      ambient.intensity = night ? 1.05 : 2.05;
      fill.color.set(night ? '#8eabff' : '#fff0d7');
      fill.intensity = night ? 0.9 : 2.1;
      lampLight.intensity = on ? 5 : 0;
      bulb.material.color.set(on ? '#ffe1a1' : '#51442f');
    },
  };
}
