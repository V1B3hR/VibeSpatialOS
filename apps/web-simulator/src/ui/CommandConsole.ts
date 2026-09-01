/**
 * VIBE SpatialOS - Multimodal AI & Deictic Console Controller
 * Integrates command line input, suggestion chips, voice recognition, and log banners.
 */

import { MultimodalSpatialAgent, SpatialAIResponse } from '@vibe/semantic-ai';
import { SpeechRecognizer } from '../input/SpeechRecognizer.js';

export class CommandConsole {
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private micBtn: HTMLButtonElement;
  private logTextEl: HTMLElement;
  private chips: NodeListOf<HTMLButtonElement>;

  private speechRec: SpeechRecognizer;

  constructor(
    private agent: MultimodalSpatialAgent,
    private onActionExecuted?: (res: SpatialAIResponse) => void
  ) {
    this.inputEl = document.getElementById('cmd-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('btn-send') as HTMLButtonElement;
    this.micBtn = document.getElementById('btn-mic') as HTMLButtonElement;
    this.logTextEl = document.getElementById('log-text') as HTMLElement;
    this.chips = document.querySelectorAll('.prompt-chip');

    this.speechRec = new SpeechRecognizer();
    this.setupListeners();
  }

  private setupListeners(): void {
    // Send on button click
    this.sendBtn.addEventListener('click', () => this.handleCommandSubmit());

    // Send on Enter key
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleCommandSubmit();
      }
    });

    // Quick suggestion chips
    this.chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd');
        if (cmd) {
          this.inputEl.value = cmd;
          this.handleCommandSubmit();
        }
      });
    });

    // Mic Voice Recognition
    this.micBtn.addEventListener('click', () => {
      this.speechRec.toggle();
    });

    this.speechRec.onStatusChange((listening) => {
      if (listening) {
        this.micBtn.classList.add('listening');
        this.logMessage('Listening for spatial voice command...');
      } else {
        this.micBtn.classList.remove('listening');
      }
    });

    this.speechRec.onResult((transcript) => {
      this.inputEl.value = transcript;
      this.handleCommandSubmit();
    });
  }

  public async handleCommandSubmit(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.logMessage(`Processing: "${text}"...`);
    const res = await this.agent.processCommand(text);

    this.logMessage(res.message);
    this.inputEl.value = '';

    if (this.onActionExecuted) {
      this.onActionExecuted(res);
    }
  }

  public logMessage(msg: string): void {
    if (this.logTextEl) {
      this.logTextEl.innerText = msg;
    }
  }
}
