/**
 * VIBE SpatialOS - Multimodal Speech Recognition Interface
 * Listens for spatial and deictic voice commands using Web Speech API with fallback simulation.
 */

export class SpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private onResultCallback: ((transcript: string) => void) | null = null;
  private onStatusChangeCallback: ((listening: boolean) => void) | null = null;

  constructor() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        if (this.onResultCallback) {
          this.onResultCallback(text);
        }
      };

      this.recognition.onerror = (err: any) => {
        console.warn('[SpeechRecognizer] Web Speech Notice:', err.error);
        this.setListening(false);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try { this.recognition.start(); } catch {}
        }
      };
    }
  }

  public onResult(callback: (transcript: string) => void): void {
    this.onResultCallback = callback;
  }

  public onStatusChange(callback: (listening: boolean) => void): void {
    this.onStatusChangeCallback = callback;
  }

  public toggle(): boolean {
    if (this.isListening) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public start(): void {
    if (!this.recognition) {
      console.log('[SpeechRecognizer] Web Speech API not natively available in this browser. Using text prompt & simulated voice.');
      this.setListening(true);
      return;
    }

    try {
      this.recognition.start();
      this.setListening(true);
    } catch (e) {
      console.warn('[SpeechRecognizer] Start notice:', e);
    }
  }

  public stop(): void {
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
    }
    this.setListening(false);
  }

  private setListening(val: boolean): void {
    this.isListening = val;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(val);
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}
