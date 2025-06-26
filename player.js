const titleElem = document.getElementById('title-display');
const messageElem = document.getElementById('message-display');
const indexElem = document.getElementById('client-index');
const webRoomsWebSocketServerAddr = 'https://nosch.uber.space/web-rooms/';

const circleRadius = 50;

let clientId = null;
let clientCount = 0;

titleElem.innerText = 'Citypaint';
messageElem.innerText = '';

// Neue Definitionen für Canvas, Context und Zeichen-Status
const canvasMap = {};
const contextMap = {};
let aktiveNummer = null;
let zeichnen = false;

// Audio-Variablen
let dayAudioBuffer, nightAudioBuffer;
let daySource = null;
let nightSource = null;
let audioCtx = null;
let isDay = true;

// Definition der Graffiti-Planes mit Position, Rotation und Größe
const graffitiPlanes = [
  { id: 1, position: '15 1.6 -13.49', rotation: '0 180 0', width: 3, height: 4 },
  { id: 2, position: '-16.51 1.6 15', rotation: '0 90 0', width: 3, height: 4 },
  { id: 3, position: '5 1.6 3.49', rotation: '0 0 0', width: 3, height: 4 },
];

// Textur-Map für die Planes
const textureMap = {};

// Erstelle für jede Plane ein Canvas, Textur, Plane-Element und setze Zeichenlogik
graffitiPlanes.forEach(({ id, position, rotation, width, height }) => {
  // Canvas erzeugen
  const canvas = document.createElement('canvas');
  canvas.width = 512 * 2;
  canvas.height = 512 * 4;
  canvas.id = `canvas${id}`;
  canvas.style.display = 'none';
  canvas.style.position = 'absolute';
  canvas.style.top = '10px';
  canvas.style.left = '10px';
  document.body.appendChild(canvas);

  // Canvas und Context speichern
  canvasMap[id] = canvas;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`;
  ctx.lineWidth = 2;
  contextMap[id] = ctx;

  // Plane erzeugen
  const plane = document.createElement('a-plane');
  plane.setAttribute('id', `plane${id}`);
  plane.setAttribute('position', position);
  plane.setAttribute('rotation', rotation);
  plane.setAttribute('width', width);
  plane.setAttribute('height', height);

  // Texture erstellen und speichern
  const texture = new THREE.CanvasTexture(canvas);
  textureMap[id] = texture;

  // Material mit Textur setzen nach Laden des Plane-Meshes
  plane.addEventListener('loaded', () => {
    const mesh = plane.getObject3D('mesh');
    if (mesh) {
      mesh.material.map = texture;
      mesh.material.side = THREE.DoubleSide;
      mesh.material.needsUpdate = true;
    }
  });

  // Plane in Szene einfügen
  document.querySelector('a-scene').appendChild(plane);

  // Klick auf Plane aktiviert zugehörige Canvas
  plane.addEventListener('click', () => toggleCanvas(id));
});

// Mausposition im Canvas berechnen
function getCanvasCoords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

// Zeichenfläche anzeigen/verstecken (toggle)
function toggleCanvas(num) {
  const canvas = canvasMap[num];

  // Falls dieselbe Fläche aktiv ist → schließen
  if (aktiveNummer === num) {
    canvas.style.display = 'none';
    aktiveNummer = null;
    return;
  }

  // Andere Fläche deaktivieren
  if (aktiveNummer) {
    canvasMap[aktiveNummer].style.display = 'none';
  }

  aktiveNummer = num;
  canvas.style.display = 'block';

  const ctx = contextMap[num];

  canvas.onmousedown = (e) => {
    zeichnen = true;
    const pos = getCanvasCoords(canvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    sendRequest('*broadcast-message*', ['draw-start', num, pos.x, pos.y]);
  };

  canvas.onmouseup = () => zeichnen = false;

  canvas.onmousemove = (e) => {
    if (!zeichnen) return;
    const pos = getCanvasCoords(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    updatePlaneTexture(num);
    sendRequest('*broadcast-message*', ['draw-line',num, pos.x, pos.y]);
  };
}

function updatePlaneTexture(num) {
  const plane = document.querySelector(`#plane${num}`);
  const mesh = plane.getObject3D('mesh');
  if (mesh && mesh.material.map) {
    mesh.material.map.needsUpdate = true;
  }
}

// Tasteneingabe: 1, 2, 3 → Umschalten der Canvas
document.addEventListener('keydown', (event) => {
  if (['1', '2', '3'].includes(event.key)) {
    toggleCanvas(Number(event.key));
  }
});

/****************************************************************
 * websocket-Kommunikation
 */
const socket = new WebSocket(webRoomsWebSocketServerAddr);

// auf das Öffnen der WebSocket-Verbindung hören
socket.addEventListener('open', (event) => {
  sendRequest('*enter-room*', 'citypaint');
  sendRequest('*subscribe-client-count*');
  sendRequest('*broadcast-message*', ['draw-line', num, pos.x, pos.y]);
  sendRequest('*broadcast-message*', ['draw-start', num, pos.x, pos.y]);

  // Server regelmäßig mit einer leeren Nachricht anpingen, damit die Verbindung nicht geschlossen wird
  setInterval(() => socket.send(''), 30000);
});

socket.addEventListener('close', (event) => {
  clientId = null;
  document.body.classList.add('disconnected');
  sendRequest('*broadcast-message*', ['end', clientId]);
});

// auf Nachrichten vom Server hören
socket.addEventListener('message', (event) => {
  const data = event.data;

  if (data.length > 0) {
    const incoming = JSON.parse(data);
    const selector = incoming[0];

    // eingehende Nachrichten verteilen
    switch (selector) {
      case '*client-id*':
        clientId = incoming[1] + 1;
        indexElem.innerHTML = `#${clientId}/${clientCount}`;
        break;
        case 'draw-line': {
          const num = incoming[1];
          const x = incoming[2];
          const y = incoming[3];
          const ctx = contextMap[num];
          if (ctx) {
            ctx.beginPath(); // Beginne einen neuen Pfad
            ctx.arc(x, y, 2, 0, 2 * Math.PI); // Zeichne einen kleinen Kreis
            ctx.fill();
            updatePlaneTexture(num); // Aktualisiere die Textur
          }
          break;
        }
        case 'draw-start': {
          const num = incoming[1];
          const x = incoming[2];
          const y = incoming[3];
          const ctx = contextMap[num];
          if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y); // Setze den Startpunkt des Pfades
          }
          break;
        }
      case '*client-count*':
        clientCount = incoming[1];
        indexElem.innerHTML = `#${clientId}/${clientCount}`;
        break;

      case '*error*': {
        const message = incoming[1];
        console.warn('server error:', ...message);
        break;
      }

      case 'draw': {
        const [_, fromId, canvasNum, x, y] = incoming;
        const ctx = contextMap[canvasNum];
        if (!ctx) return;

        ctx.lineTo(x, y);
        ctx.stroke();
        updatePlaneTexture(canvasNum);
        break;
      }

      default:
        break;
    }
  }
});

function sendRequest(...message) {
  const str = JSON.stringify(message);
  socket.send(str);
}

// Audio-Funktionen
async function initAudioBuffers() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const loadBuffer = async (url) => {
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(data);
  };

  dayAudioBuffer = await loadBuffer('sounds/day.mp3');
  nightAudioBuffer = await loadBuffer('sounds/night.mp3');

  playCurrentSceneSound();
}

function stopAllSounds() {
  if (daySource) daySource.stop();
  if (nightSource) nightSource.stop();
}

function playCurrentSceneSound() {
  stopAllSounds();

  if (isDay && dayAudioBuffer) {
    daySource = audioCtx.createBufferSource();
    daySource.buffer = dayAudioBuffer;
    daySource.loop = true;
    daySource.connect(audioCtx.destination);
    daySource.start(0);
  } else if (!isDay && nightAudioBuffer) {
    nightSource = audioCtx.createBufferSource();
    nightSource.buffer = nightAudioBuffer;
    nightSource.loop = true;
    nightSource.connect(audioCtx.destination);
    nightSource.start(0);
  }
}

// Umschalten zwischen Tag- und Nachtszene per Taste T
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 't') {
    isDay = !isDay;
    document.querySelector('a-sky').setAttribute('color', isDay ? '#87CEEB' : '#000022');
    playCurrentSceneSound();
  }
});

// Initialisiere Audio nach erstem Klick (Autoplay-Schutz)
document.addEventListener('click', () => {
  if (!audioCtx) {
    initAudioBuffers();
  }
}, { once: true });
