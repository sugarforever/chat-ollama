import xterm, { type Terminal as XtermTerminal } from '@xterm/headless';

import type { InteractiveTerminal } from '../src/interactive-cli.js';

// Adapted from pi-mono/packages/tui/test/virtual-terminal.ts (MIT).
export class VirtualTerminal implements InteractiveTerminal {
  readonly #xterm: XtermTerminal;
  #onInput?: (data: string) => void;
  #onResize?: () => void;
  readonly writes: string[] = [];
  stopped = false;

  constructor(public columns = 80, public rows = 24) {
    this.#xterm = new xterm.Terminal({
      cols: columns,
      rows,
      disableStdin: true,
      allowProposedApi: true,
    });
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.#onInput = onInput;
    this.#onResize = onResize;
    this.write('\x1b[?2004h');
  }

  stop(): void {
    this.write('\x1b[?2004l');
    this.#onInput = undefined;
    this.#onResize = undefined;
    this.stopped = true;
  }

  async drainInput(): Promise<void> {}

  write(data: string): void {
    this.writes.push(data);
    this.#xterm.write(data);
  }

  get kittyProtocolActive(): boolean { return true; }
  moveBy(lines: number): void {
    if (lines) this.write(`\x1b[${Math.abs(lines)}${lines > 0 ? 'B' : 'A'}`);
  }
  hideCursor(): void { this.write('\x1b[?25l'); }
  showCursor(): void { this.write('\x1b[?25h'); }
  clearLine(): void { this.write('\x1b[K'); }
  clearFromCursor(): void { this.write('\x1b[J'); }
  clearScreen(): void { this.write('\x1b[2J\x1b[H'); }
  setTitle(title: string): void { this.write(`\x1b]0;${title}\x07`); }
  setProgress(_active: boolean): void {}

  sendInput(data: string): void { this.#onInput?.(data); }

  type(text: string): void {
    for (const character of text) this.sendInput(character);
  }

  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.#xterm.resize(columns, rows);
    this.#onResize?.();
  }

  async screen(): Promise<string> {
    // TUI schedules its throttled differential render before xterm consumes it.
    await new Promise<void>(resolve => process.nextTick(resolve));
    await new Promise<void>(resolve => setTimeout(resolve, 25));
    await new Promise<void>(resolve => this.#xterm.write('', resolve));
    const buffer = this.#xterm.buffer.active;
    return Array.from({ length: this.rows }, (_, row) =>
      buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? '',
    ).join('\n');
  }

  dispose(): void { this.#xterm.dispose(); }
}
