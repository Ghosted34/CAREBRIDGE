import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom ships no <dialog> implementation, so Modal's showModal() is a no-op and every control
// inside a modal stays hidden and unfocusable in tests. Opening it via the `open` attribute is
// enough for jsdom's user-agent stylesheet to render the contents.
const dialogProto = Object.getPrototypeOf(document.createElement('dialog')) as {
  showModal?: () => void;
  close?: () => void;
};
if (!dialogProto.showModal) {
  dialogProto.showModal = function (this: HTMLElement) {
    this.setAttribute('open', '');
  };
  dialogProto.close = function (this: HTMLElement) {
    this.removeAttribute('open');
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
