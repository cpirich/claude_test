/**
 * Altair 8800 2SIO Serial Board
 *
 * Emulates a Motorola 6850 ACIA on I/O ports 0x10-0x11:
 *   Port 0x10 (status): bit 0 = RX data ready, bit 1 = TX buffer empty (always 1)
 *   Port 0x11 (data):   read = next input char, write = output char
 *
 * Implements the IOBus interface — the system's I/O handler routes
 * ports 0x10-0x11 here.
 *
 * Output callback sends characters to terminal buffer.
 * Input buffer fed by keyboard events (queue of ASCII bytes).
 */

import type { IOBus } from '@/cpu/i8080';

/** Status register bits. */
const STATUS_RDRF = 0x01; // Receive Data Register Full (bit 0)
const STATUS_TDRE = 0x02; // Transmit Data Register Empty (bit 1, always 1)

/** Callback for characters written to the serial output. */
export type SerialOutputCallback = (char: number) => void;

export class Altair2SIO implements IOBus {
  /** Input character queue (keyboard → serial). */
  private inputBuffer: number[] = [];

  /** Output callback (serial → terminal). */
  private outputCallback: SerialOutputCallback | null = null;

  /** Register a callback for serial output characters. */
  setOutputCallback(cb: SerialOutputCallback): void {
    this.outputCallback = cb;
  }

  /** Queue a character for the CPU to read (keyboard input). */
  sendInput(char: number): void {
    this.inputBuffer.push(char & 0x7f);
  }

  /** Queue a string of characters for input. */
  sendString(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.inputBuffer.push(str.charCodeAt(i) & 0x7f);
    }
  }

  /** Check if there are pending input characters. */
  hasInput(): boolean {
    return this.inputBuffer.length > 0;
  }

  /** Read from an I/O port. */
  in(port: number): number {
    const portLow = port & 0xff;

    switch (portLow) {
      case 0x10: {
        // Status register
        let status = STATUS_TDRE; // TX always ready
        if (this.inputBuffer.length > 0) {
          status |= STATUS_RDRF; // RX data available
        }
        return status;
      }

      case 0x11: {
        // Data register — read next input character
        if (this.inputBuffer.length > 0) {
          return this.inputBuffer.shift()!;
        }
        return 0x00; // No data
      }

      default:
        // Other ports: return 0xFF (floating bus)
        return 0xff;
    }
  }

  /** Write to an I/O port. */
  out(port: number, value: number): void {
    const portLow = port & 0xff;

    switch (portLow) {
      case 0x10:
        // Control register write — reset the ACIA
        // On a real 6850, writing specific values controls data format,
        // clock divisor, etc. We ignore this for emulation simplicity.
        break;

      case 0x11:
        // Data register — output character
        if (this.outputCallback) {
          this.outputCallback(value & 0x7f);
        }
        break;

      // Other ports: ignored
    }
  }

  /** Reset the serial board. */
  reset(): void {
    this.inputBuffer = [];
  }

  /** Get number of pending input characters (for testing). */
  get pendingInputCount(): number {
    return this.inputBuffer.length;
  }
}
