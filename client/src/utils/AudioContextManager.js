/**
 * AudioContextManager.js
 * 
 * specialized utility to handle "robust" audio playback on mobile browsers.
 * It uses the Web Audio API (instead of HTML5 <audio>) because:
 * 1. It allows precise control over timing and looping.
 * 2. It can be "unlocked" by a single user interaction and stay active.
 * 3. It creates an Oscillator (synthesized sound) which is more reliable 
 *    than loading external MP3 files on slow connections, ensuring 
 *    immediate feedback.
 */

class AudioContextManager {
    constructor() {
        this.audioContext = null;
        this.isUnlocked = false;
        this.isPlaying = false;
        this.oscillator = null;
        this.gainNode = null;

        // Bind methods
        this.unlock = this.unlock.bind(this);
        this.playRingtone = this.playRingtone.bind(this);
        this.stopRingtone = this.stopRingtone.bind(this);
    }

    /**
     * Initialize and "unlock" the AudioContext.
     * Must be called inside a USER INTERACTION event (click/touchstart).
     */
    unlock() {
        if (this.isUnlocked && this.audioContext?.state === 'running') {
            return; // Already unlocked
        }

        try {
            // Create context if not exists
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }

            // Resume context (browsers suspend it by default)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log('[AudioContext] Resumed and unlocked');
                    this.isUnlocked = true;
                });
            } else {
                this.isUnlocked = true;
            }

            // Play a silent buffer to fully "warm up" the audio engine
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);

        } catch (e) {
            console.error('[AudioContext] Unlock failed:', e);
        }
    }

    /**
     * Plays a "phone ring" style sound using an Oscillator.
     * This is 100% reliable as it doesn't need to load external files.
     */
    async playRingtone() {
        if (this.isPlaying) return; // Already playing

        // Ensure context is running
        if (!this.audioContext) {
            this.unlock(); // Try to unlock/init (might fail if no interaction, but worth a shot)
        }

        if (this.audioContext?.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (e) {
                console.warn('[AudioContext] Could not resume context for ringtone:', e);
            }
        }

        this.isPlaying = true;

        try {
            // Create Oscillator (Sound Generator)
            this.oscillator = this.audioContext.createOscillator();
            this.gainNode = this.audioContext.createGain();

            // Configure Sound (Sine wave = nice clean beep)
            this.oscillator.type = 'sine';
            this.oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4 note (440Hz)

            // Ringing Pattern: "Drrring... Drrring..." 
            // We modulate amplitude (volume) to create the pulsing effect
            // 0 = silent, 1 = loud
            const now = this.audioContext.currentTime;

            // Start silent
            this.gainNode.gain.setValueAtTime(0, now);

            // Loop pattern: Beep (0.4s) - Pause (0.2s) - Beep (0.4s) - Long Pause (2s)
            // We schedule this loop repeatedly
            const loopDuration = 3.0; // Total cycle time

            // Connect nodes: Oscillator -> Gain (Volume) -> Output
            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            this.oscillator.start(now);

            // Use efficient interval to schedule beeps
            // We verify isPlaying inside to stop appropriately
            const scheduleBeeps = () => {
                if (!this.isPlaying || !this.audioContext) return;

                const time = this.audioContext.currentTime;

                // Beep 1
                this.gainNode.gain.linearRampToValueAtTime(0.5, time + 0.1);
                this.gainNode.gain.linearRampToValueAtTime(0, time + 0.4);

                // Beep 2
                this.gainNode.gain.linearRampToValueAtTime(0.5, time + 0.6);
                this.gainNode.gain.linearRampToValueAtTime(0, time + 1.0);
            };

            // Run immediately and then loop
            scheduleBeeps();
            this.intervalId = setInterval(scheduleBeeps, loopDuration * 1000);

            console.log('[AudioContext] Ringtone started (Oscillator)');

        } catch (e) {
            console.error('[AudioContext] Play failed:', e);
            this.isPlaying = false;
        }
    }

    stopRingtone() {
        if (!this.isPlaying) return;

        try {
            if (this.intervalId) clearInterval(this.intervalId);

            if (this.oscillator) {
                // Ramp down volume to avoid "click" sound logic
                const now = this.audioContext.currentTime;
                this.gainNode?.gain.linearRampToValueAtTime(0, now + 0.1);
                setTimeout(() => {
                    this.oscillator?.stop();
                    this.oscillator?.disconnect();
                    this.gainNode?.disconnect();
                    this.oscillator = null;
                    this.gainNode = null;
                }, 150);
            }
        } catch (e) {
            console.error('[AudioContext] Stop failed:', e);
        } finally {
            this.isPlaying = false;
            console.log('[AudioContext] Ringtone stopped');
        }
    }
}

// Export as singleton
const audioManager = new AudioContextManager();
export default audioManager;
