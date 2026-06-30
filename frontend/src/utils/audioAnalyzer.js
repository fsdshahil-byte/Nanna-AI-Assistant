import * as THREE from "three";
/**
 * Audio Analyser for lip-sync and reactive animations
 */
export class AudioAnalyzer {
    constructor(audioContext, source) {
        this.lipSyncData = {
            A: 0,
            E: 0,
            I: 0,
            O: 0,
            U: 0,
            etc: 0,
        };
        this.audioContext = audioContext;
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        this.frequencyData = new Float32Array(bufferLength);
    }
    /**
     * Update lip-sync data based on frequency analysis
     */
    updateLipSync() {
        this.analyser.getByteFrequencyData(this.dataArray);
        // Convert to float for better precision
        for (let i = 0; i < this.dataArray.length; i++) {
            this.frequencyData[i] = this.dataArray[i] / 255;
        }
        // Frequency ranges for different vowels (simplified model)
        // These are approximations - real lip sync would use more sophisticated analysis
        const low = this.frequencyData.slice(0, 4).reduce((a, b) => a + b) / 4; // A (low)
        const lowMid = this.frequencyData.slice(4, 8).reduce((a, b) => a + b) / 4; // E (low-mid)
        const mid = this.frequencyData.slice(8, 16).reduce((a, b) => a + b) / 8; // I (mid)
        const highMid = this.frequencyData.slice(16, 32).reduce((a, b) => a + b) / 16; // O (high-mid)
        const high = this.frequencyData.slice(32, 64).reduce((a, b) => a + b) / 32; // U (high)
        const veryHigh = this.frequencyData.slice(64, 128).reduce((a, b) => a + b) / 64; // etc
        this.lipSyncData = {
            A: Math.min(1, low * 2),
            E: Math.min(1, lowMid * 2),
            I: Math.min(1, mid * 2),
            O: Math.min(1, highMid * 2),
            U: Math.min(1, high * 2),
            etc: Math.min(1, veryHigh * 2),
        };
        return this.lipSyncData;
    }
    /**
     * Get average frequency energy for animations
     */
    getAverageFrequency() {
        return this.dataArray.reduce((a, b) => a + b) / this.dataArray.length / 255;
    }
    /**
     * Get peak frequency for emphasis
     */
    getPeakFrequency() {
        return Math.max(...this.dataArray) / 255;
    }
    /**
     * Get audio energy in specific frequency band
     */
    getFrequencyBand(start, end) {
        const band = this.dataArray.slice(start, end);
        return band.reduce((a, b) => a + b) / band.length / 255;
    }
    getLipSyncData() {
        return this.lipSyncData;
    }
    getAnalyser() {
        return this.analyser;
    }
}
/**
 * Avatar Animation Controller
 */
export class AvatarAnimator {
    constructor(gltf) {
        this.mixer = null;
        this.actions = new Map();
        this.currentAnimation = null;
        this.idleTimeout = null;
        if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(gltf.scene);
            for (const clip of gltf.animations) {
                const action = this.mixer.clipAction(clip);
                this.actions.set(clip.name, action);
            }
        }
    }
    /**
     * Play animation by name
     */
    playAnimation(name, fadeTime = 0.5) {
        if (!this.mixer)
            return;
        const action = this.actions.get(name);
        if (!action)
            return;
        // Fade out previous animation
        if (this.currentAnimation && this.currentAnimation !== name) {
            const prevAction = this.actions.get(this.currentAnimation);
            if (prevAction) {
                prevAction.fadeOut(fadeTime);
            }
        }
        action.reset();
        action.fadeIn(fadeTime);
        action.play();
        this.currentAnimation = name;
        // Clear idle timeout
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }
    }
    /**
     * Play idle animation after delay
     */
    playIdleAfterDelay(delay = 5000) {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }
        this.idleTimeout = setTimeout(() => {
            this.playAnimation("idle", 0.5);
        }, delay);
    }
    /**
     * Update mixer (call in animation loop)
     */
    update(deltaTime) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
    }
    /**
     * Get list of available animations
     */
    getAnimations() {
        return Array.from(this.actions.keys());
    }
}
/**
 * Create a microphone icon animation for listening state
 */
export const createListeningAnimation = (mesh) => {
    if (!mesh.material)
        return;
    const material = mesh.material;
    const originalEmissive = material.emissive.getHex();
    const pulse = (time) => {
        const intensity = Math.sin(time * 4) * 0.5 + 0.5;
        material.emissiveIntensity = intensity * 0.8;
    };
    // Animation loop would call pulse with elapsed time
};
/**
 * Morphing animation utilities
 */
export const morphTargetInfluences = {
    /**
     * Set mouth shape based on vowel
     */
    setMouthShape(mesh, vowel) {
        if (!mesh.morphTargetInfluences)
            return;
        const targets = mesh.morphTargetDictionary || {};
        const shapes = {
            A: { mouth_open: 1, mouth_a: 1 },
            E: { mouth_open: 0.7, mouth_e: 1 },
            I: { mouth_open: 0.4, mouth_i: 1 },
            O: { mouth_open: 0.8, mouth_o: 1 },
            U: { mouth_open: 0.6, mouth_u: 1 },
        };
        const shape = shapes[vowel] || {};
        for (const [target, value] of Object.entries(shape)) {
            const index = targets[target];
            if (index !== undefined) {
                mesh.morphTargetInfluences[index] = value;
            }
        }
    },
    /**
     * Set eye blink
     */
    setEyeBlink(mesh, amount) {
        if (!mesh.morphTargetInfluences)
            return;
        const targets = mesh.morphTargetDictionary || {};
        const blinkIndex = targets["blink"];
        if (blinkIndex !== undefined) {
            mesh.morphTargetInfluences[blinkIndex] = Math.max(0, 1 - amount);
        }
    },
};
