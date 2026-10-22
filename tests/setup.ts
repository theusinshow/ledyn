import { Blob as NodeBlob } from 'node:buffer';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// No ambiente jsdom + fake-indexeddb, o Blob nativo do Node/Web garante suporte real
// a structuredClone no IndexedDB e a Blob.prototype.arrayBuffer() tal como nos navegadores.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
