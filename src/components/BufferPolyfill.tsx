"use client";

import { Buffer } from "buffer";

// Polyfill global Buffer in the browser client environment for web3 wallet compatibility
if (typeof window !== "undefined") {
  if (!(window as any).Buffer) {
    (window as any).Buffer = Buffer;
  }
  if (!(window as any).global) {
    (window as any).global = window;
  }
}

export function BufferPolyfill() {
  return null;
}

