
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
let pointerStart = null;

function getAudioNode(id) {
  return audioNodes.find(node => node.id === id);
}

function getDistance(avatar) {
  const dx = (avatar.x - 0.5) * 2;
  const dy = (avatar.y - 0.5) * 2;
  return Math.sqrt(dx * dx + dy * dy);
}

function setStatus(message, color = "#65e6d2") {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.style.color = color;
}

function placeAvatar(avatar) {
  const element = document.getElementById(avatar.id);
  const info = document.getElementById(avatar.positionId);

  if (!element || !info || !space) return;

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

  // Only the selected avatar is audible.
  const isSelected = avatar.id === selectedAvatarId;
  const volume = isSelected
    ? Math.max(0.015, 0.2 / (1 + distance * 2))
    : 0;

  node.gain.gain.setTargetAtTime(
    volume,
    audioContext.currentTime,
    0.06
  );

  node.panner.positionX.setTargetAtTime(
    dx * 5,
    audioContext.currentTime,
    0.06
  );

  node.panner.positionY.setTargetAtTime(
    0,
    audioContext.currentTime,
    0.06
  );

  node.panner.positionZ.setTargetAtTime(
    -Math.max(1, distance * 5),
    audioContext.currentTime,
    0.06
  );
}

function selectAvatar(avatar) {
  selectedAvatarId = avatar.id;

  if (!audioContext) {
    setStatus(
      `${avatar.name} selected — press Start Audio`,
      "#65e6d2"
    );
    return;
  }

  avatars.forEach(updateAvatarAudio);

  setStatus(
    `Playing ${avatar.name} — ${avatar.frequency} Hz`,
    "#65e6d2"
  );
}

async function startAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (!selectedAvatarId) {
      selectAvatar(avatars[0]);
    } else {
      avatars.forEach(updateAvatarAudio);
    }

    return;
  }

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

    if (!selectedAvatarId) {
      selectedAvatarId = avatars[0].id;
    }

    updateAllAvatars();

    const selected = avatars.find(
      avatar => avatar.id === selectedAvatarId
    );

    setStatus(
      `Playing ${selected ? selected.name : "avatar"}`,
      "#65e6d2"
    );
  } catch (error) {
    console.error("Could not start audio:", error);
    await stopAudio();
    setStatus("Audio error — check the console", "#ff7070");
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

avatars.forEach(avatar => {
  const element = document.getElementById(avatar.id);
  if (!element || !space) return;

  element.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;

    draggingAvatar = avatar;
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      moved: false
    };

    if (element.setPointerCapture) {
      element.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  });

  element.addEventListener("pointermove", event => {
    if (draggingAvatar !== avatar || !pointerStart) return;

    const distanceMoved = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y
    );

    if (distanceMoved > 5) {
      pointerStart.moved = true;
    }

    if (!pointerStart.moved) return;

    const rect = space.getBoundingClientRect();

    avatar.x = (event.clientX - rect.left) / rect.width;
    avatar.y = (event.clientY - rect.top) / rect.height;

    placeAvatar(avatar);
  });

  function finishPointer() {
    if (draggingAvatar !== avatar) return;

    // A short press selects the avatar; a drag moves it.
    if (pointerStart && !pointerStart.moved) {
      selectAvatar(avatar);
    }

    draggingAvatar = null;
    pointerStart = null;
  }

  element.addEventListener("pointerup", finishPointer);

  element.addEventListener("pointercancel", () => {
    draggingAvatar = null;
    pointerStart = null;
  });

  element.addEventListener("keydown", event => {
    const step = 0.025;

    if (event.key === "ArrowLeft") avatar.x -= step;
    else if (event.key === "ArrowRight") avatar.x += step;
    else if (event.key === "ArrowUp") avatar.y -= step;
    else if (event.key === "ArrowDown") avatar.y += step;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAvatar(avatar);
      return;
    } else {
      return;
    }

    event.preventDefault();
    placeAvatar(avatar);
  });
});

playBtn.addEventListener("click", startAudio);
stopBtn.addEventListener("click", stopAudio);

window.addEventListener("resize", updateAllAvatars);

window.testProxiSpeakAvatar = name => {
  const avatar = avatars.find(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (avatar) {
    selectAvatar(avatar);
    return startAudio();
  }
};

updateAllAvatars();
