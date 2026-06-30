export const playAlertTone = () => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  const audioContext = new AudioContextCtor();
  const playBeep = (start, frequency) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.45);
  };

  const now = audioContext.currentTime;
  [0, 0.62, 1.24, 1.86].forEach((offset, index) => playBeep(now + offset, index % 2 ? 740 : 880));
  window.setTimeout(() => audioContext.close().catch(() => undefined), 2800);
};

export const ringInBrowser = (title, body) => {
  playAlertTone();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${title}. ${body}`);
    utterance.rate = 0.94;
    utterance.pitch = 1.08;
    window.speechSynthesis.speak(utterance);
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
};
