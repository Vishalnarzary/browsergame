import * as THREE from "three";

export type OfficeActivity = "desk" | "chatting" | "phone" | "presenting";
export type PowerupKind = "titan" | "laser" | "long_leg" | "phase" | "clone";

export type SceneTarget = {
  id: number;
  lane: number;
  z: number;
  color: string;
  suit: string;
  role: string;
  activity: OfficeActivity;
  seed: number;
  hitMode?: "back" | "side";
  hitOutcome?: "launch" | "arm_break" | "leg_break";
  hitAge?: number;
};

export type SceneItem = { id: number; lane: number; z: number; type: "cart" | "coffee" | "table" };
export type ScenePursuer = { id: number; lane: number; gap: number; seed: number; role: string; color: string; suit: string };
export type ScenePowerup = { id: number; lane: number; z: number; kind: PowerupKind; rarity: "common" | "rare" | "legendary" };
export type SceneStrike = { id: number; kind: PowerupKind; fromLane: number; toLane: number; targetZ: number; age: number };

export type SceneFrame = {
  running: boolean;
  elapsed: number;
  distance: number;
  playerLane: number;
  targetLane: number;
  slapPulse: number;
  jumpProgress: number;
  speedFactor: number;
  flow: boolean;
  stumble: boolean;
  targets: SceneTarget[];
  items: SceneItem[];
  pursuers: ScenePursuer[];
  powerups: ScenePowerup[];
  activePowerups: PowerupKind[];
  strikes: SceneStrike[];
};

type Rig = THREE.Group & {
  userData: {
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    torso: THREE.Mesh;
    rightHand: THREE.Mesh;
    activity?: OfficeActivity;
    seed?: number;
    isPrimaryTarget?: boolean;
    hitBasePosition?: THREE.Vector3;
    hitBaseRotation?: THREE.Euler;
  };
};

const LANES = [-3.35, 0, 3.35];
const POWERUP_STYLE: Record<PowerupKind, { color: number; label: string }> = {
  titan: { color: 0xff8b61, label: "TITAN" },
  laser: { color: 0xff4f73, label: "LASER" },
  long_leg: { color: 0xffd75e, label: "KICK" },
  phase: { color: 0x8e8cff, label: "PHASE" },
  clone: { color: 0x6fffd3, label: "CLONE" },
};
const dark = new THREE.MeshStandardMaterial({ color: 0x132436, roughness: 0.72 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x071019, roughness: 0.9 });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) {
  const item = new THREE.Mesh(geometry, material);
  item.castShadow = shadows;
  item.receiveShadow = shadows;
  return item;
}

function limb(material: THREE.Material, length: number, radius: number) {
  const pivot = new THREE.Group();
  const part = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), 4, 8), material);
  part.position.y = -length * 0.48;
  pivot.add(part);
  return pivot;
}

function roleTexture(label: string, color: number, backed = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 160;
  const context = canvas.getContext("2d")!;
  if (backed) {
    context.fillStyle = "rgba(5,15,23,.96)";
    context.beginPath(); context.roundRect(10, 10, 492, 140, 34); context.fill();
  }
  context.fillStyle = "#ffffff";
  const size = label.length > 9 ? 60 : label.length > 6 ? 70 : 82;
  context.font = `900 ${size}px Arial`;
  context.textAlign = "center"; context.textBaseline = "middle";
  context.strokeStyle = backed ? `#${color.toString(16).padStart(6, "0")}` : "rgba(0,0,0,.92)";
  context.lineWidth = backed ? 9 : 15;
  context.lineJoin = "round";
  context.strokeText(label, 256, 84);
  context.fillText(label, 256, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addRoleLabel(group: THREE.Group, label: string, color: number) {
  if (!label) return;
  const material = new THREE.SpriteMaterial({ map: roleTexture(label, color), transparent: true, depthTest: false, depthWrite: false });
  const labelSprite = new THREE.Sprite(material);
  labelSprite.position.set(0, 4.12, 0);
  labelSprite.scale.set(2.9, 0.9, 1);
  labelSprite.renderOrder = 30;
  labelSprite.userData.roleLabel = true;
  group.add(labelSprite);
}

function createPerson(bodyColor: number, accentColor: number, runner = false, roleLabel = ""): Rig {
  const group = new THREE.Group() as Rig;
  const skinTones = [0xf2b486, 0xd89262, 0x9f6042, 0x6d3f2d, 0xe6a575];
  const skinColor = skinTones[Math.abs((bodyColor + accentColor) % skinTones.length)];
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.82 });
  const body = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.68, metalness: 0.03 });
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f5ef, roughness: 0.82 });
  const torso = mesh(new THREE.CapsuleGeometry(runner ? 0.43 : 0.4, 0.56, 8, 16), body);
  torso.scale.set(1, 1, 0.68);
  torso.position.y = 2.08;
  torso.rotation.x = runner ? -0.08 : 0;
  group.add(torso);

  const shirt = mesh(new THREE.CapsuleGeometry(0.31, 0.25, 6, 12), white);
  shirt.scale.set(1, 1, 0.64); shirt.position.set(0, 2.28, -0.12);
  group.add(shirt);
  const tie = mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), accent);
  tie.position.set(0, 2.22, -0.36); tie.rotation.z = Math.PI;
  group.add(tie);
  const hips = mesh(new THREE.SphereGeometry(0.36, 14, 10), accent);
  hips.scale.set(1, 0.58, 0.72); hips.position.y = 1.46;
  group.add(hips);

  const neck = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 8), skin);
  neck.position.y = 2.78;
  group.add(neck);
  const head = mesh(new THREE.SphereGeometry(0.38, 18, 14), skin);
  head.scale.set(0.92, 1.08, 0.94);
  head.position.y = 3.18;
  group.add(head);
  const hair = mesh(new THREE.SphereGeometry(0.37, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), dark);
  hair.position.y = 3.36;
  group.add(hair);
  for (const x of [-0.38, 0.38]) {
    const ear = mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
    ear.position.set(x, 3.18, 0); group.add(ear);
  }
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x18212a, roughness: 0.7 });
  for (const x of [-0.13, 0.13]) {
    const eye = mesh(new THREE.SphereGeometry(0.044, 10, 8), eyeMaterial, false);
    eye.position.set(x, 3.25, -0.355); group.add(eye);
    const brow = mesh(new THREE.CapsuleGeometry(0.016, 0.11, 3, 6), dark, false);
    brow.rotation.z = Math.PI / 2; brow.position.set(x, 3.34, -0.354); group.add(brow);
  }
  const nose = mesh(new THREE.ConeGeometry(0.065, 0.16, 10), skin);
  nose.rotation.x = -Math.PI / 2; nose.position.set(0, 3.16, -0.41); group.add(nose);
  const mouth = mesh(new THREE.CapsuleGeometry(0.014, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: 0x8d3e45 }), false);
  mouth.rotation.z = Math.PI / 2; mouth.position.set(0, 3.03, -0.37); group.add(mouth);

  const leftArm = limb(body, 1.05, 0.14);
  const rightArm = limb(body, 1.05, 0.14);
  leftArm.position.set(-0.57, 2.55, 0);
  rightArm.position.set(0.57, 2.55, 0);
  group.add(leftArm, rightArm);
  const leftHand = mesh(new THREE.SphereGeometry(0.16, 12, 9), skin);
  const rightHand = leftHand.clone();
  leftHand.position.y = -1; rightHand.position.y = -1;
  leftArm.add(leftHand); rightArm.add(rightHand);

  const leftLeg = limb(accent, 1.22, 0.17);
  const rightLeg = limb(accent, 1.22, 0.17);
  leftLeg.position.set(-0.25, 1.45, 0);
  rightLeg.position.set(0.25, 1.45, 0);
  group.add(leftLeg, rightLeg);
  const leftShoe = mesh(new THREE.CapsuleGeometry(0.15, 0.34, 5, 10), shoe);
  const rightShoe = leftShoe.clone();
  leftShoe.rotation.x = Math.PI / 2; rightShoe.rotation.x = Math.PI / 2;
  leftShoe.position.set(0, -1.13, -0.18);
  rightShoe.position.set(0, -1.13, -0.18);
  leftLeg.add(leftShoe);
  rightLeg.add(rightShoe);

  addRoleLabel(group, roleLabel, bodyColor);

  group.userData = { leftArm, rightArm, leftLeg, rightLeg, torso, rightHand };
  return group;
}

function createDeskScene(person: Rig) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x845b42, roughness: 0.75 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x25394b, roughness: 0.8 });
  const desk = mesh(new THREE.BoxGeometry(2.45, 0.16, 1), wood);
  desk.position.set(0, 1.18, -0.55);
  group.add(desk);
  for (const x of [-0.94, 0.94]) {
    const leg = mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), wood);
    leg.position.set(x, 0.58, -0.55);
    group.add(leg);
  }
  const screen = mesh(new THREE.BoxGeometry(0.88, 0.62, 0.08), new THREE.MeshStandardMaterial({ color: 0x9fffe3, emissive: 0x174d43, emissiveIntensity: 0.7 }));
  screen.position.set(0, 1.67, -0.47);
  screen.rotation.x = -0.08;
  group.add(screen);
  const chair = mesh(new THREE.BoxGeometry(0.9, 1.1, 0.16), chairMat);
  chair.position.set(0, 0.92, 0.48);
  group.add(chair);
  person.position.set(0, 0.46, 0.28);
  person.scale.setScalar(0.84);
  person.rotation.x = -0.08;
  person.userData.leftLeg.rotation.x = -1.18;
  person.userData.rightLeg.rotation.x = -1.18;
  person.userData.leftArm.rotation.x = -1.1;
  person.userData.rightArm.rotation.x = -1.1;
  group.add(person);
  return group;
}

function createActivityScene(activity: OfficeActivity, bodyColor: number, suitColor: number, seed: number, roleLabel: string) {
  const primary = createPerson(bodyColor, suitColor, false, roleLabel);
  primary.userData.isPrimaryTarget = true;
  primary.userData.activity = activity;
  primary.userData.seed = seed;
  if (activity === "desk") return createDeskScene(primary);

  const group = new THREE.Group();
  group.add(primary);
  if (activity === "chatting") {
    primary.position.set(0, 0, 0.25);
    primary.rotation.y = 0;
    const mateA = createPerson(0xe7b956, 0x426a7d, false, "COLLEAGUE");
    mateA.scale.setScalar(0.88);
    mateA.position.set(-1.15, 0, -0.38);
    mateA.rotation.y = -0.65;
    mateA.userData.activity = "chatting";
    mateA.userData.seed = seed + 1.4;
    group.add(mateA);
  } else if (activity === "phone") {
    const phone = mesh(new THREE.BoxGeometry(0.16, 0.32, 0.06), new THREE.MeshStandardMaterial({ color: 0x05090e }));
    phone.position.set(0.46, 2.72, -0.22);
    phone.rotation.z = -0.25;
    group.add(phone);
    primary.userData.rightArm.rotation.z = -0.55;
    primary.userData.rightArm.rotation.x = -1.75;
  } else {
    primary.position.x = 0.75;
    primary.rotation.y = -0.36;
    const board = mesh(new THREE.BoxGeometry(2.2, 1.45, 0.12), new THREE.MeshStandardMaterial({ color: 0xe6f3ed, roughness: 0.75 }));
    board.position.set(-0.78, 2.05, -0.6);
    const chart = mesh(new THREE.BoxGeometry(1.38, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0xff6f61, emissive: 0x4b1414, emissiveIntensity: 0.25 }));
    chart.position.set(-0.78, 2.12, -0.67);
    chart.rotation.z = -0.2;
    primary.userData.leftArm.rotation.z = 0.85;
    primary.userData.leftArm.rotation.x = -1.15;
    group.add(board, chart);
  }
  return group;
}

function animateRig(rig: Rig, time: number, runner: boolean, slapPulse = 0) {
  const cycle = time * (runner ? 12 : 2.2) + (rig.userData.seed ?? 0);
  if (runner) {
    const swing = Math.sin(cycle) * 0.86;
    const slapWave = slapPulse > 0 ? Math.sin((1 - slapPulse) * Math.PI) : 0;
    rig.userData.leftLeg.rotation.x = swing;
    rig.userData.rightLeg.rotation.x = -swing;
    rig.userData.leftArm.rotation.x = -swing * 0.85;
    rig.userData.rightArm.rotation.x = swing * 0.72 - slapWave * 0.48;
    rig.userData.rightArm.rotation.y = -slapWave * 0.72;
    rig.userData.rightArm.rotation.z = -slapWave * 1.55;
    rig.userData.torso.rotation.z = Math.sin(cycle * 0.5) * 0.035;
    rig.userData.torso.rotation.y = slapWave * 0.38;
    rig.userData.rightHand.scale.set(1 + slapWave * 0.45, 0.88 + slapWave * 0.18, 1 + slapWave * 0.62);
    rig.position.y = Math.abs(Math.sin(cycle)) * 0.085;
  } else if (rig.userData.activity === "chatting") {
    rig.userData.leftArm.rotation.z = Math.sin(cycle) * 0.35;
    rig.userData.rightArm.rotation.z = -Math.cos(cycle * 0.8) * 0.28;
    rig.rotation.z = Math.sin(cycle * 0.5) * 0.025;
  } else if (rig.userData.activity === "presenting") {
    rig.userData.leftArm.rotation.z = 0.8 + Math.sin(cycle) * 0.2;
  } else if (rig.userData.activity === "desk") {
    rig.userData.leftArm.rotation.x = -1.05 + Math.sin(cycle * 1.5) * 0.08;
    rig.userData.rightArm.rotation.x = -1.05 - Math.sin(cycle * 1.7) * 0.08;
  }
}

function walkRigs(root: THREE.Object3D, callback: (rig: Rig) => void) {
  root.traverse((object) => {
    if (object.userData?.leftArm && object.userData?.rightLeg) callback(object as Rig);
  });
}

function updateRoleLabels(root: THREE.Object3D, z: number, visible = true) {
  const distanceScale = 1 + THREE.MathUtils.clamp((-z - 8) / 70, 0, 1) * 1.3;
  root.traverse((object) => {
    if (object instanceof THREE.Sprite && object.userData.roleLabel) {
      object.visible = visible;
      object.scale.set(2.9 * distanceScale, 0.9 * distanceScale, 1);
    }
  });
}

export class OfficeRunner3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 180);
  private player: Rig;
  private clone: Rig;
  private aura = new THREE.Group();
  private targetMeshes = new Map<number, THREE.Group>();
  private itemMeshes = new Map<number, THREE.Group>();
  private pursuerMeshes = new Map<number, Rig>();
  private impactMeshes = new Map<number, THREE.Group>();
  private powerupMeshes = new Map<number, THREE.Group>();
  private strikeMeshes = new Map<number, THREE.Object3D>();
  private hallway: THREE.Group[] = [];
  private speedMarkers: THREE.Mesh[] = [];
  private clock = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.background = new THREE.Color(0x091522);
    this.scene.fog = new THREE.Fog(0x173143, 34, 118);
    this.camera.position.set(0, 8.8, 22.5);
    this.camera.lookAt(0, 1.35, -39);

    this.scene.add(new THREE.HemisphereLight(0xbfffee, 0x13202c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-7, 13, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 18; key.shadow.camera.bottom = -5;
    this.scene.add(key);

    this.buildOffice();
    this.player = createPerson(0x1bbba0, 0x1d5f9a, true);
    this.player.scale.setScalar(1.1);
    this.player.position.set(0, 0, 5);
    // Default body front faces -Z, the same direction as the run.
    this.player.rotation.y = 0;
    this.scene.add(this.player);
    this.clone = createPerson(0x6fffd3, 0x4f8fff, true);
    this.clone.scale.setScalar(1.04); this.clone.rotation.y = 0; this.clone.visible = false;
    this.clone.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.material = object.material.clone(); object.material.transparent = true; object.material.opacity = 0.42;
        object.material.emissive.setHex(0x1f8070); object.material.emissiveIntensity = 0.72;
      }
    });
    this.scene.add(this.clone);
    for (let index = 0; index < 3; index++) {
      const ring = mesh(new THREE.TorusGeometry(0.72 + index * 0.2, 0.035, 8, 34), new THREE.MeshBasicMaterial({ color: 0x6fffd3, transparent: true, opacity: 0.34, depthWrite: false }), false);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.18 + index * 0.18; ring.userData.auraIndex = index; this.aura.add(ring);
    }
    this.aura.visible = false; this.scene.add(this.aura);
    this.resize(canvas.clientWidth || 1200, canvas.clientHeight || 700);
  }

  private buildOffice() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x35565d, roughness: 0.9 });
    const floor = mesh(new THREE.PlaneGeometry(17, 140), floorMat, false);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -52;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const laneMat = new THREE.MeshBasicMaterial({ color: 0x7df5cf, transparent: true, opacity: 0.12 });
    for (const x of [-1.67, 1.67]) {
      const line = mesh(new THREE.PlaneGeometry(0.04, 140), laneMat, false);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.012, -52);
      this.scene.add(line);
    }
    const streakMaterial = new THREE.MeshBasicMaterial({ color: 0xb7ffe9, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
    for (let i = 0; i < 30; i++) {
      const streak = mesh(new THREE.PlaneGeometry(0.055, 1.2), streakMaterial.clone(), false);
      streak.rotation.x = -Math.PI / 2;
      streak.position.set(LANES[i % 3] + ((i % 2) - 0.5) * 1.15, 0.02, -100 + i * 4);
      streak.userData.baseZ = i * 4;
      this.speedMarkers.push(streak);
      this.scene.add(streak);
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x182e40, roughness: 0.84 });
    for (const x of [-8.5, 8.5]) {
      const wall = mesh(new THREE.PlaneGeometry(140, 7.5), wallMat, false);
      wall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      wall.position.set(x, 3.75, -52);
      this.scene.add(wall);
    }

    for (let i = 0; i < 12; i++) {
      const segment = new THREE.Group();
      segment.userData.baseZ = i * 11;
      const beamMat = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2c5361 : 0x244653, roughness: 0.72 });
      const beam = mesh(new THREE.BoxGeometry(17, 0.16, 0.18), beamMat);
      beam.position.y = 6.6;
      segment.add(beam);
      const light = mesh(new THREE.BoxGeometry(4.6, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8fff0, emissive: 0x86ddc6, emissiveIntensity: 2.2 }), false);
      light.position.y = 6.5;
      segment.add(light);
      for (const side of [-1, 1]) {
        const glass = mesh(new THREE.BoxGeometry(0.12, 4.7, 4.7), new THREE.MeshStandardMaterial({ color: 0x4e8891, transparent: true, opacity: 0.22, roughness: 0.2 }), false);
        glass.position.set(side * 8.38, 2.7, -1.4);
        segment.add(glass);
        const cabinet = mesh(new THREE.BoxGeometry(0.8, 1.8, 1.3), new THREE.MeshStandardMaterial({ color: side < 0 ? 0x9a6046 : 0x516a7d, roughness: 0.85 }));
        cabinet.position.set(side * 7.8, 0.9, 2.5);
        segment.add(cabinet);
      }
      this.hallway.push(segment);
      this.scene.add(segment);
    }
  }

  resize(width: number, height: number) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private makeTarget(target: SceneTarget) {
    const scene = createActivityScene(target.activity, Number.parseInt(target.color.slice(1), 16), Number.parseInt(target.suit.slice(1), 16), target.seed, target.role);
    // Employees face toward the incoming runner, opposite the hero's -Z direction.
    scene.rotation.y = Math.PI;
    return scene;
  }

  private makeItem(item: SceneItem) {
    const group = new THREE.Group();
    if (item.type === "cart") {
      const cartMat = new THREE.MeshStandardMaterial({ color: 0xf2c95b, roughness: 0.6, metalness: 0.1 });
      const tray = mesh(new THREE.BoxGeometry(2.35, 0.25, 1.15), cartMat);
      tray.position.y = 1.08;
      group.add(tray);
      for (const x of [-0.95, 0.95]) for (const z of [-0.36, 0.36]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.2, z);
        group.add(wheel);
      }
      for (const x of [-0.95, 0.95]) {
        const post = mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 8), cartMat);
        post.position.set(x, 0.62, 0);
        group.add(post);
      }
      const handle = mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), cartMat);
      handle.position.set(-1.25, 1.5, 0);
      handle.rotation.z = -0.17;
      group.add(handle);
    } else if (item.type === "coffee") {
      const cup = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.72, 12), new THREE.MeshStandardMaterial({ color: 0xf5efe4 }));
      cup.position.y = 0.52;
      const lid = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x143849 }));
      lid.position.y = 0.91;
      const glow = mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 24), new THREE.MeshBasicMaterial({ color: 0x6fffd3 }));
      glow.position.y = 0.35;
      glow.rotation.x = Math.PI / 2;
      group.add(cup, lid, glow);
    } else {
      const top = mesh(new THREE.CapsuleGeometry(0.22, 1.7, 5, 12), new THREE.MeshStandardMaterial({ color: 0x9b6848, roughness: 0.72 }));
      top.rotation.z = Math.PI / 2; top.scale.z = 2.5; top.position.y = 1.12;
      group.add(top);
      for (const x of [-0.88, 0.88]) for (const z of [-0.36, 0.36]) {
        const leg = mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.02, 9), new THREE.MeshStandardMaterial({ color: 0x4a5963, metalness: 0.35, roughness: 0.45 }));
        leg.position.set(x, 0.53, z); group.add(leg);
      }
      const edge = mesh(new THREE.BoxGeometry(2.35, 0.1, 0.13), new THREE.MeshBasicMaterial({ color: 0xffd75e }));
      edge.position.set(0, 1.18, 0.58); group.add(edge);
    }
    return group;
  }

  private makeImpact(target: SceneTarget) {
    const group = new THREE.Group();
    const color = target.hitMode === "back" ? 0x6fffd3 : 0xff6f61;
    for (let index = 0; index < 3; index++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 - index * 0.2, depthWrite: false });
      const ring = mesh(new THREE.TorusGeometry(0.45 + index * 0.18, 0.045, 8, 30), material, false);
      ring.userData.ringIndex = index; group.add(ring);
    }
    for (let index = 0; index < 18; index++) {
      const angle = (index / 18) * Math.PI * 2;
      const particle = mesh(new THREE.SphereGeometry(0.045 + (index % 3) * 0.018, 7, 5), new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? 0xffffff : color, transparent: true, depthWrite: false }), false);
      particle.userData.direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), (index % 2 ? 1 : -1) * 0.28);
      group.add(particle);
    }
    if (target.hitOutcome === "arm_break" || target.hitOutcome === "leg_break") {
      const shardCount = target.hitOutcome === "leg_break" ? 7 : 4;
      for (let index = 0; index < shardCount; index++) {
        const shard = mesh(new THREE.BoxGeometry(0.07, 0.26 + (index % 2) * 0.09, 0.07), new THREE.MeshBasicMaterial({ color: 0xfff5dc, transparent: true, opacity: 0.95, depthWrite: false }), false);
        const angle = (index / shardCount) * Math.PI * 2 + 0.3;
        shard.userData.direction = new THREE.Vector3(Math.cos(angle), 0.45 + Math.sin(angle) * 0.5, (index % 2 ? 1 : -1) * 0.36);
        shard.userData.boneShard = true; group.add(shard);
      }
    }
    group.position.set(LANES[target.lane], 2.25, target.z + 0.25);
    return group;
  }

  private makePowerup(powerup: ScenePowerup) {
    const style = POWERUP_STYLE[powerup.kind];
    const group = new THREE.Group();
    const core = mesh(new THREE.IcosahedronGeometry(0.48, 2), new THREE.MeshStandardMaterial({ color: style.color, emissive: style.color, emissiveIntensity: 1.4, roughness: 0.28, metalness: 0.22 }));
    core.position.y = 1.08; core.userData.powerCore = true; group.add(core);
    for (let index = 0; index < 2; index++) {
      const ring = mesh(new THREE.TorusGeometry(0.72 + index * 0.17, 0.045, 8, 28), new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.74, depthWrite: false }), false);
      ring.position.y = 1.08; ring.rotation.x = index ? Math.PI / 2 : 0; ring.userData.powerRing = index; group.add(ring);
    }
    const badge = mesh(new THREE.PlaneGeometry(1.35, 0.45), new THREE.MeshBasicMaterial({ map: roleTexture(style.label, style.color, true), transparent: true, side: THREE.DoubleSide, depthWrite: false }), false);
    badge.position.set(0, 2.05, 0.05); group.add(badge);
    const beam = mesh(new THREE.CylinderGeometry(0.03, 0.22, 1.35, 12, 1, true), new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), false);
    beam.position.y = 0.6; group.add(beam);
    return group;
  }

  private makeStrike(strike: SceneStrike) {
    const style = POWERUP_STYLE[strike.kind];
    if (strike.kind === "laser") {
      const points = [new THREE.Vector3(LANES[strike.fromLane], 2.35, 4.6), new THREE.Vector3(LANES[strike.toLane], 2.2, strike.targetZ)];
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: 1, linewidth: 2 }));
    }
    const group = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(strike.kind === "titan" ? 1.3 : 0.92, 0.09, 8, 32), new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.85, depthWrite: false }), false);
    ring.position.set(LANES[strike.toLane], strike.kind === "long_leg" ? 1.15 : 1.8, strike.targetZ);
    if (strike.kind === "long_leg") ring.rotation.z = Math.PI / 2;
    group.add(ring);
    return group;
  }

  render(frame: SceneFrame, dt: number) {
    this.clock += dt;
    this.hallway.forEach((segment) => {
      // Architecture moves toward the camera as the hero advances into -Z.
      const cycle = (segment.userData.baseZ + frame.distance * 0.78) % 132;
      segment.position.z = -108 + cycle;
    });
    this.speedMarkers.forEach((marker) => {
      marker.position.z = -100 + ((marker.userData.baseZ + frame.distance * 0.95) % 120);
      marker.scale.y = 0.72 + frame.speedFactor * 1.15;
      const material = marker.material as THREE.MeshBasicMaterial;
      material.opacity = 0.07 + frame.speedFactor * 0.1;
    });

    const desiredPlayerX = LANES[0] + (LANES[2] - LANES[0]) * (frame.playerLane / 2);
    const playerX = THREE.MathUtils.lerp(this.player.position.x, desiredPlayerX, Math.min(1, dt * 13));
    const lateral = playerX - this.player.position.x;
    this.player.position.x = playerX;
    this.player.rotation.z = THREE.MathUtils.lerp(this.player.rotation.z, -lateral * 0.7, Math.min(1, dt * 12));
    const torsoMaterial = this.player.userData.torso.material;
    if (torsoMaterial instanceof THREE.MeshStandardMaterial) torsoMaterial.color.setHex(frame.flow ? 0x78ffd7 : 0x1bbba0);
    animateRig(this.player, this.clock * (0.72 + frame.speedFactor * 0.32), frame.running, frame.slapPulse);
    const titanActive = frame.activePowerups.includes("titan");
    const kickActive = frame.activePowerups.includes("long_leg");
    const playerScale = titanActive ? 1.72 : 1.1;
    this.player.scale.lerp(new THREE.Vector3(playerScale, playerScale, playerScale), Math.min(1, dt * 7));
    const legScale = kickActive ? 1.82 : 1;
    this.player.userData.leftLeg.scale.y = THREE.MathUtils.lerp(this.player.userData.leftLeg.scale.y, legScale, Math.min(1, dt * 9));
    this.player.userData.rightLeg.scale.y = THREE.MathUtils.lerp(this.player.userData.rightLeg.scale.y, legScale, Math.min(1, dt * 9));
    if (kickActive) {
      const kick = Math.max(0, Math.sin(this.clock * 10.5));
      this.player.userData.rightLeg.rotation.z = -kick * 0.92;
      this.player.position.y += 0.62;
    } else {
      this.player.userData.leftLeg.rotation.z = THREE.MathUtils.lerp(this.player.userData.leftLeg.rotation.z, 0, Math.min(1, dt * 10));
      this.player.userData.rightLeg.rotation.z = THREE.MathUtils.lerp(this.player.userData.rightLeg.rotation.z, 0, Math.min(1, dt * 10));
    }
    if (frame.jumpProgress > 0) {
      this.player.position.y += Math.sin(frame.jumpProgress * Math.PI) * 2.25;
      this.player.rotation.x = -Math.sin(frame.jumpProgress * Math.PI) * 0.17;
    }
    if (frame.stumble) this.player.rotation.x = Math.sin(this.clock * 28) * 0.12;
    else if (frame.jumpProgress <= 0) this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, 0, Math.min(1, dt * 8));

    const cloneActive = frame.activePowerups.includes("clone");
    this.clone.visible = cloneActive;
    if (cloneActive) {
      const mirrorLane = 2 - Math.round(frame.playerLane);
      this.clone.position.set(LANES[mirrorLane], this.player.position.y, 5.2);
      animateRig(this.clone, this.clock * 1.08, frame.running, frame.slapPulse * 0.7);
    }
    this.aura.visible = frame.activePowerups.length > 0;
    if (this.aura.visible) {
      const primary = POWERUP_STYLE[frame.activePowerups[0]].color;
      this.aura.position.set(this.player.position.x, 0, 5);
      this.aura.rotation.y += dt * 1.8;
      this.aura.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.color.setHex(primary); material.opacity = 0.22 + Math.sin(this.clock * 5 + child.userData.auraIndex) * 0.1;
      });
    }

    const liveTargets = new Set(frame.targets.map((target) => target.id));
    for (const [id, object] of this.targetMeshes) if (!liveTargets.has(id)) { this.scene.remove(object); this.targetMeshes.delete(id); }
    for (const target of frame.targets) {
      let object = this.targetMeshes.get(target.id);
      if (!object) { object = this.makeTarget(target); this.targetMeshes.set(target.id, object); this.scene.add(object); }
      object.position.set(LANES[target.lane], 0, target.z);
      let primaryRig: Rig | undefined;
      walkRigs(object, (rig) => {
        animateRig(rig, this.clock, false);
        if (rig.userData.isPrimaryTarget) primaryRig = rig;
      });
      if (target.hitMode) {
        const age = target.hitAge ?? 0;
        const direction = target.hitMode === "side" ? 1 : -1;
        if (primaryRig) {
          primaryRig.userData.hitBasePosition ??= primaryRig.position.clone();
          primaryRig.userData.hitBaseRotation ??= primaryRig.rotation.clone();
          primaryRig.position.copy(primaryRig.userData.hitBasePosition);
          primaryRig.rotation.copy(primaryRig.userData.hitBaseRotation);
          if (target.hitOutcome === "arm_break") {
            const fall = THREE.MathUtils.clamp((age - 0.1) / 0.62, 0, 1);
            primaryRig.userData.rightArm.rotation.set(age * 8.5 - 0.7, age * 5.2, direction * -2.35);
            primaryRig.userData.rightArm.position.set(0.57 + direction * age * 3.2, 2.55 + age * 3.4, age * 1.35);
            primaryRig.userData.leftArm.rotation.z = direction * (0.8 + fall * 0.7);
            primaryRig.rotation.z += direction * fall * 1.52;
            primaryRig.position.x += direction * fall * 0.82;
            primaryRig.position.y += Math.sin(Math.min(1, age * 4.3) * Math.PI) * 0.42;
          } else if (target.hitOutcome === "leg_break") {
            primaryRig.userData.leftLeg.rotation.set(1.1 + age * 9.2, age * 4.2, 1.45 + age * 2.3);
            primaryRig.userData.rightLeg.rotation.set(-1.1 - age * 9.2, -age * 4.2, -1.45 - age * 2.3);
            primaryRig.userData.leftLeg.position.set(-0.25 - age * 2.8, 1.45 - age * 7.2, age * 0.7);
            primaryRig.userData.rightLeg.position.set(0.25 + age * 2.8, 1.45 - age * 7.2, -age * 0.7);
            primaryRig.position.x += direction * age * 4.6;
            primaryRig.position.y += age * 10.4 + age * age * 2.2;
            primaryRig.rotation.x += age * 8.4; primaryRig.rotation.z += direction * age * 4.8;
          } else {
            primaryRig.position.x += direction * age * 5.8;
            primaryRig.position.y += age * 12.2 + age * age * 2.4;
            primaryRig.position.z -= age * 5.6;
            primaryRig.rotation.x += age * 6.8; primaryRig.rotation.z += direction * age * 8.8;
          }
        }
      }
      updateRoleLabels(object, target.z, !target.hitMode);
    }

    const hitTargets = frame.targets.filter((target) => target.hitMode && target.hitAge !== undefined);
    const liveImpacts = new Set(hitTargets.map((target) => target.id));
    for (const [id, object] of this.impactMeshes) if (!liveImpacts.has(id)) { this.scene.remove(object); this.impactMeshes.delete(id); }
    for (const target of hitTargets) {
      let impact = this.impactMeshes.get(target.id);
      if (!impact) { impact = this.makeImpact(target); this.impactMeshes.set(target.id, impact); this.scene.add(impact); }
      const age = target.hitAge ?? 0;
      impact.position.set(LANES[target.lane], 2.25, target.z + 0.25);
      impact.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (child.userData.ringIndex !== undefined) {
          const scale = 1 + age * (3.8 + child.userData.ringIndex * 0.7);
          child.scale.setScalar(scale); material.opacity = Math.max(0, (0.46 - age) * 2.1) * (1 - child.userData.ringIndex * 0.18);
        } else if (child.userData.boneShard) {
          const direction = child.userData.direction as THREE.Vector3;
          child.position.copy(direction).multiplyScalar(age * 7.2);
          child.rotation.x = age * 12; child.rotation.z = age * 9;
          material.opacity = Math.max(0, 1 - age / 0.78);
        } else {
          const direction = child.userData.direction as THREE.Vector3;
          child.position.copy(direction).multiplyScalar(age * 5.4);
          child.scale.setScalar(1 + age * 2.2); material.opacity = Math.max(0, 1 - age * 2.4);
        }
      });
    }

    const liveItems = new Set(frame.items.map((item) => item.id));
    for (const [id, object] of this.itemMeshes) if (!liveItems.has(id)) { this.scene.remove(object); this.itemMeshes.delete(id); }
    for (const item of frame.items) {
      let object = this.itemMeshes.get(item.id);
      if (!object) { object = this.makeItem(item); this.itemMeshes.set(item.id, object); this.scene.add(object); }
      object.position.set(LANES[item.lane], item.type === "coffee" ? Math.sin(this.clock * 4 + item.id) * 0.13 : 0, item.z);
      if (item.type === "coffee") object.rotation.y += dt * 2.5;
    }

    const livePowerups = new Set(frame.powerups.map((powerup) => powerup.id));
    for (const [id, object] of this.powerupMeshes) if (!livePowerups.has(id)) { this.scene.remove(object); this.powerupMeshes.delete(id); }
    for (const powerup of frame.powerups) {
      let object = this.powerupMeshes.get(powerup.id);
      if (!object) { object = this.makePowerup(powerup); this.powerupMeshes.set(powerup.id, object); this.scene.add(object); }
      object.position.set(LANES[powerup.lane], Math.sin(this.clock * 3 + powerup.id) * 0.18, powerup.z);
      object.rotation.y += dt * 1.45;
      object.children.forEach((child) => { if (child.userData.powerRing !== undefined) child.rotation.z += dt * (child.userData.powerRing ? -2.1 : 2.6); });
    }

    const liveStrikes = new Set(frame.strikes.map((strike) => strike.id));
    for (const [id, object] of this.strikeMeshes) if (!liveStrikes.has(id)) { this.scene.remove(object); this.strikeMeshes.delete(id); }
    for (const strike of frame.strikes) {
      let object = this.strikeMeshes.get(strike.id);
      if (!object) { object = this.makeStrike(strike); this.strikeMeshes.set(strike.id, object); this.scene.add(object); }
      const fade = Math.max(0, 1 - strike.age * 2.5);
      object.scale.setScalar(1 + strike.age * 2.8);
      object.traverse((child) => {
        if (child instanceof THREE.Line && child.material instanceof THREE.LineBasicMaterial) child.material.opacity = fade;
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = fade;
      });
    }

    const livePursuers = new Set(frame.pursuers.map((pursuer) => pursuer.id));
    for (const [id, object] of this.pursuerMeshes) if (!livePursuers.has(id)) { this.scene.remove(object); this.pursuerMeshes.delete(id); }
    for (const pursuer of frame.pursuers) {
      let object = this.pursuerMeshes.get(pursuer.id);
      if (!object) {
        object = createPerson(Number.parseInt(pursuer.color.slice(1), 16), Number.parseInt(pursuer.suit.slice(1), 16), true, "");
        object.scale.setScalar(0.98);
        object.rotation.y = 0;
        object.userData.seed = pursuer.seed;
        this.pursuerMeshes.set(pursuer.id, object);
        this.scene.add(object);
      }
      object.position.x = LANES[0] + (LANES[2] - LANES[0]) * (pursuer.lane / 2);
      object.position.z = 5 + pursuer.gap;
      animateRig(object, this.clock + pursuer.seed, true);
      updateRoleLabels(object, object.position.z);
    }

    const cameraTargetX = (LANES[frame.targetLane] ?? 0) * 0.09;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, cameraTargetX, Math.min(1, dt * 2.2));
    this.camera.lookAt(this.camera.position.x * 0.25, 1.35, -39);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
  }
}
