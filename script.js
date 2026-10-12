
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const distanceSlider = document.getElementById("distance");
const distanceValue = document.getElementById("distanceValue");
const volumeBar = document.getElementById("volumeBar");
const volumeValue = document.getElementById("volumeValue");
const statusText = document.getElementById("status");

let audioContext;
let oscillator;
let gainNode;

function getVolume(distance) {
  // Smoothly reduce volume as distance increases.
  return Math.max(0, 1 - distance / 500);
}

function updateDistance() {
  const distance = Number(distanceSlider.value);
  const volume = getVolume(distance);

  distanceValue.textContent = distance;
  volumeBar.style.width = `${volume * 100}%`;
  volumeValue.textContent = `${Math.round(volume * 100)}%`;

  // Smoothly update the sound while it is playing.
  if (audioContext && gainNode && audioContext.state === "running") {
    gainNode.gain.setTargetAtTime(
      volume,
      audioContext.currentTime,
      0.04
    );
  }
}

playBtn.addEventListener("click", async () => {
  try {
    if (oscillator) return;

    audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    await audioContext.resume();

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    gainNode.gain.value = getVolume(Number(distanceSlider.value));

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();

    statusText.textContent = "Playing";
    statusText.style.color = "#65e6d2";
  } catch (error) {
    console.error("Could not start audio:", error);
    statusText.textContent = "Audio error";
  }
});

stopBtn.addEventListener("click", async () => {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
    gainNode = null;
  }

  statusText.textContent = "Stopped";
  statusText.style.color = "#f5bf68";
});

distanceSlider.addEventListener("input", updateDistance);

updateDistance();
