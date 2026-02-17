import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for tests using useIsMobile hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock window.visualViewport for useKeyboardHeight hook
if (!window.visualViewport) {
  Object.defineProperty(window, "visualViewport", {
    writable: true,
    value: {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}
