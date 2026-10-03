// Thin wrapper around Three.js for displaying an uploaded room scan
// (GLB/GLTF or OBJ, exported from a LiDAR scanning app like Polycam or
// 3D Scanner App). Three.js and its loaders are loaded lazily, only when
// a 3D view is actually opened, via dynamic import against the import map
// declared in index.html.

let threeModulesPromise = null;

function loadThreeModules() {
  if (!threeModulesPromise) {
    threeModulesPromise = Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/OBJLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
    ]).then(([THREE, { GLTFLoader }, { OBJLoader }, { OrbitControls }]) => ({
      THREE,
      GLTFLoader,
      OBJLoader,
      OrbitControls,
    }));
  }
  return threeModulesPromise;
}

export async function createRoomViewer(container) {
  const { THREE, GLTFLoader, OBJLoader, OrbitControls } = await loadThreeModules();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 1000);
  camera.position.set(2, 2, 2);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(3, 5, 2);
  scene.add(dir);
  scene.add(new THREE.GridHelper(10, 20, 0x334455, 0x222a33));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let currentModel = null;
  let animId = null;

  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    object.position.sub(center);
    const distance = maxDim * 1.8;
    camera.position.set(distance, distance * 0.8, distance);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
  }

  function clearModel() {
    if (currentModel) {
      scene.remove(currentModel);
      currentModel = null;
    }
  }

  async function loadModel(blob, format) {
    clearModel();
    const url = URL.createObjectURL(blob);
    try {
      if (format === 'obj') {
        const loader = new OBJLoader();
        const object = await loader.loadAsync(url);
        currentModel = object;
      } else {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(url);
        currentModel = gltf.scene;
      }
      scene.add(currentModel);
      frameObject(currentModel);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function resize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function dispose() {
    cancelAnimationFrame(animId);
    renderer.dispose();
    clearModel();
  }

  return { loadModel, resize, dispose };
}

export function formatFromFilename(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'obj') return 'obj';
  if (ext === 'glb' || ext === 'gltf') return 'glb';
  return null;
}
