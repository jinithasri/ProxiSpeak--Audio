
const space = document.getElementById("space");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const statusText = document.getElementById("status");

const avatars = [
  {
    id: "avatarYou",
    positionId: "youPosition",
    name: "You",
    x: 0.25,
    y: 0.5,
    frequency: 220
  },
  {
    id: "avatarAlex",
    positionId: "alexPosition",
    name: "Alex",
    x: 0.5,
    y: 0.35,
    frequency: 440
  },
  {
    id: "avatarSam",
    positionId: "samPosition",
    name: "Sam",
    x: 0.75,
    y: 0.65,
    frequency: 880
  }
];

let audioContext = null;
let audioNodes = [];
let draggingAvatar = null;
let selectedAvatarId = null;

function getAudioNode(avatarId) {
  return audioNodes.find(node => node.id === avatarId);
}

function getDistance(avatar) {
  // The listener is simulated at the centre of the virtual space.
  const dx = (avatar.x - 0.5) * 2;
  const dy = (avatar.y - 0.5) * 2;

  return Math.sqrt(dx * dx + dy * dy);
}

function placeAvatar(avatar) {
  const element = document.getElementById(avatar.id);
  const info = document.getElementById(avatar.positionId);

  if (!element || !info || !space) return;

  // Keep avatars inside the virtual space.
  avatar.x = Math.max(0.06, Math.min(0.94, avatar.x));
  avatar.y = Math.max(0.12, Math.min(0.88, avatar.y));

  element.style.left = `${avatar.x * 100}%`;
  element.style.top = `${avatar.y * 100}%`;

  const rect = space.getBoundingClientRect();

  info.textContent =
    `X: ${Math.round(avatar.x * rect.width)} px, ` +
    `Y: ${Math.round(avatar.y * rect.height)} px`;

  updateAvatarAudio(avatar);
}

function updateAllAvatars() {
  avatars.forEach(placeAvatar);
}

function updateAvatarAudio(avatar) {
  if (!audioContext || audioContext.state !== "running") return;

  const node = getAudioNode(avatar.id);
  if (!node) return;

  const dx = (avatar.x - 0.5) * 2;
  const distance = getDistance(avatar);

  // Attenuate volume as the avatar moves away from the centre.
  const volume = Math.max(
    0.015,
    0.25 / (1 + distance * 2.5)
  );

  node.gain.gain.setTargetAtTime(
    volume,
    audioContext.currentTime,
    0.08
  );

  // Horizontal spatial position: left, centre or right.
  node.panner.positionX.setTargetAtTime(
    dx * 5,
    audioContext.currentTime,
    0.08
  );

  node.panner.positionY.setTargetAtTime(
    0,
    audioContext.currentTime,
    0.08
  );

  node.panner.positionZ.setTargetAtTime(
    -Math.max(1, distance * 5),
    audioContext.currentTime,
    0.08
  );
}

function startDragging(event, avatar) {
  if (event.button !== undefined && event.button !== 0) return;

  draggingAvatar = avatar;
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
}

avatars.forEach(avatar => {
  const element = document.getElementById(avatar.id);
  if (!element) return;

  element.addEventListener("pointerdown", event => {
    startDragging(event, avatar);
  });

  element.addEventListener("pointermove", event => {
    if (draggingAvatar !== avatar) return;

    const rect = space.getBoundingClientRect();

    avatar.x = (event.clientX - rect.left) / rect.width;
    avatar.y = (event.clientY - rect.top) / rect.height;

    placeAvatar(avatar);
  });

  element.addEventListener("pointerup", () => {
    draggingAvatar = null;
  });

  element.addEventListener("pointercancel", () => {
    draggingAvatar = null;
  });

  element.addEventListener("keydown", event => {
    const step = 0.025;

    if (event.key === "ArrowLeft") avatar.x -= step;
    else if (event.key === "ArrowRight") avatar.x += step;
    else if (event.key === "ArrowUp") avatar.y -= step;
    else if (event.key === "ArrowDown") avatar.y += step;
    else return;

    event.preventDefault();
    placeAvatar(avatar);
  });
});

function setStatus(message, color) {
  statusText.textContent = message;
  statusText.style.color = color;
}

async function startAudio() {
  if (audioContext) return;

  try {
    audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    await audioContext.resume();

    avatars.forEach(avatar => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const panner = audioContext.createPanner();

      oscillator.type = "sine";
      oscillator.frequency.value = avatar.frequency;

      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 100;
      panner.rolloffFactor = 0;

      // Start silent; updateAvatarAudio sets the actual volume.
      gain.gain.value = 0;

      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(audioContext.destination);

      oscillator.start();

      audioNodes.push({
        id: avatar.id,
        oscillator,
        gain,
        panner
      });
    });

    updateAllAvatars();

    setStatus("Playing — all avatars", "#65e6d2");
  } catch (error) {
    console.error("Could not start audio:", error);

    const failedContext = audioContext;
    audioContext = null;
    audioNodes = [];

    if (failedContext) {
      await failedContext.close().catch(() => {});
    }

    setStatus("Audio error", "#ff7070");
  }
}

async function stopAudio() {
  const context = audioContext;

  audioContext = null;
  audioNodes = [];
  selectedAvatarId = null;

  if (context) {
    await context.close().catch(console.error);
  }

  setStatus("Stopped", "#f5bf68");
}

async function testAvatar(avatar) {
  // Stop the previous audio session before testing another tone.
  await stopAudio();

  try {
    audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    await audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const panner = audioContext.createPanner();

    oscillator.type = "sine";
    oscillator.frequency.value = avatar.frequency;

    panner.panningModel = "HRTF";

    const dx = (avatar.x - 0.5) * 2;

    panner.positionX.value = dx * 5;
    panner.positionY.value = 0;
    panner.positionZ.value = -2;

    gain.gain.value = 0.15;

    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(audioContext.destination);

    audioNodes.push({
      id: avatar.id,
      oscillator,
      gain,
      panner
    });

    oscillator.start();

    selectedAvatarId = avatar.id;
    setStatus(
      `Testing ${avatar.name} — ${avatar.frequency} Hz`,
      "#65e6d2"
    );
  } catch (error) {
    console.error("Could not test avatar audio:", error);

    const failedContext = audioContext;
    audioContext = null;
    audioNodes = [];

    if (failedContext) {
      await failedContext.close().catch(() => {});
    }

    setStatus("Audio error", "#ff7070");
  }
}

playBtn.addEventListener("click", startAudio);
stopBtn.addEventListener("click", stopAudio);

// Expose the test function for the optional buttons below.
window.testProxiSpeakAvatar = name => {
  const avatar = avatars.find(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (avatar) testAvatar(avatar);
};

window.addEventListener("resize", updateAllAvatars);

updateAllAvatars();
