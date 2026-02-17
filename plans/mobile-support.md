# Mobile Support for Microcomputer Emulator

## Context

The emulator is desktop-only: terminal containers are hardcoded at 720x540px, keyboard input relies on physical keyboards via DOM `keydown`/`keyup`, and there's no responsive layout. On mobile, the terminal overflows the viewport, and there's no way to type. This plan adds full mobile support: responsive layout, native iOS keyboard input via hidden input field, a special-key toolbar, and an overlay for controls.

## Approach: Native Keyboard + Hidden Input + Special-Key Toolbar

Instead of building a full custom virtual keyboard, we use the phone's native keyboard by focusing a hidden `<input>` element. Character input flows through `input`/`beforeinput` events, gets converted to synthetic `KeyboardEvent` dispatches on the terminal container, then the input is cleared. This reuses all existing key-mapping logic in `useApple1`, `useTrs80`, and `useAltair8800` without modification.

For special keys not available on the native keyboard (ESC, arrows, BREAK, CLEAR, etc.), a slim toolbar of buttons sits between the terminal and the native keyboard.

### Preventing iOS Auto-Scroll on Focus

iOS Safari auto-scrolls to bring focused inputs into view. To prevent this:

1. **Position the hidden input inside the visible viewport** — not offscreen. Use `position: fixed; bottom: 0; left: 0` so it's at the bottom of the screen (where the keyboard will appear). Make it invisible with `opacity: 0; height: 1px; width: 1px; border: 0; padding: 0` — iOS won't scroll to a zero-height input, but a 1px input at the viewport bottom causes no visible scroll.
2. **Lock the page layout** — The mobile page uses `position: fixed; inset: 0; overflow: hidden` which prevents any document scroll.
3. **Use `visualViewport` API** — Listen to `visualViewport.resize` events to detect when the native keyboard appears/disappears and dynamically resize the terminal container to fill only the space above the keyboard. This avoids the content being pushed behind the keyboard.
4. **`scrollIntoView` prevention** — Set `preventScroll: true` when programmatically focusing the hidden input: `input.focus({ preventScroll: true })`.

### Input Flow

```
User taps key on iOS keyboard
  → hidden <input> receives character via `input` event
  → handler reads e.data (the inserted character)
  → dispatches KeyboardEvent('keydown', { key: char }) on terminal container
  → for TRS-80: dispatches KeyboardEvent('keyup') after 80ms
  → clears the input field (set value = '')
  → existing hook handlers process the event as if it were a physical keypress
```

For `Enter`, `Backspace`, etc., the `beforeinput` event's `inputType` tells us what happened:
- `insertLineBreak` → dispatch `Enter`
- `deleteContentBackward` → dispatch `Backspace`
- `insertText` → dispatch the character from `e.data`

## New Files

| File | Purpose |
|------|---------|
| `src/hooks/useIsMobile.ts` | `matchMedia`-based mobile detection (< 768px) |
| `src/components/MobileInput.tsx` | Hidden input field + special-key toolbar + visualViewport management |
| `src/components/MobileOverlay.tsx` | FAB + shadcn Sheet for machine switching, RESET, LOAD, COPY |
| `src/components/ui/sheet.tsx` | shadcn Sheet (install via CLI) |
| `src/components/ui/button.tsx` | shadcn Button (install via CLI) |

## Modified Files

### `src/app/layout.tsx`
- Add `viewport` export: `userScalable: false`, `viewportFit: "cover"` (prevents iOS zoom, enables safe area insets)

### `src/components/TerminalDisplay.tsx`
- Add `isMobile` prop to `TerminalDisplayProps` and each sub-terminal
- **Container sizing**: Desktop unchanged (720x540px). Mobile: `width: 100%`, `height: 100%` (flex child fills available space)
- **`TerminalHandle`**: Add `getContainer(): HTMLElement | null` to expose container ref for synthetic event dispatch
- Each sub-terminal's `useImperativeHandle` returns `{ typeCommand, getContainer: () => containerRef.current }`
- Hide dimensions badge (`40x24`) on mobile to save header space
- Add `user-select: none` on mobile to prevent text selection on touch

### `src/components/EmulatorPage.tsx`
- Import `useIsMobile`, `MobileInput`, `MobileOverlay`
- **Desktop**: Unchanged layout (header + tabs + MachineInfo + terminal)
- **Mobile layout**:
  ```
  [TerminalDisplay — fills remaining space above keyboard]
  [Special-key toolbar — slim row of ESC, arrows, etc.]
  [Native iOS keyboard — managed by hidden input focus]
  [MobileOverlay — floating FAB + Sheet]
  ```
- Outer div: `position: fixed; inset: 0` on mobile with `overflow: hidden` to prevent any scroll
- Header, TabsList, MachineInfo, Badge all hidden on mobile (their controls move to MobileOverlay)
- Use `visualViewport` height to set terminal container height dynamically

### `src/components/SoftwareLibraryModal.tsx`
- Modal container: add responsive classes for full-screen on mobile

### `src/app/globals.css`
- Special-key toolbar styles: `user-select: none`, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`
- Safe area padding: `padding-bottom: env(safe-area-inset-bottom)`
- Mobile page lock: `position: fixed; inset: 0; overflow: hidden`

## MobileInput Component Design

### Hidden Input
- `<input>` element: `position: fixed; bottom: 0; opacity: 0; height: 1px; width: 1px`
- `autoCapitalize="none"` `autoCorrect="off"` `autoComplete="off"` `spellCheck={false}`
- For Apple I: `autoCapitalize="characters"` (force uppercase keyboard)
- Focused on mount; re-focused after any overlay/modal interaction
- `focus({ preventScroll: true })` always used

### Special-Key Toolbar
A single row of buttons for keys not on the native keyboard, rendered between the terminal and the keyboard area:

```
| ESC | TAB | ← | → | ↑ | ↓ | BREAK | CTRL |
```

- Machine-adaptive: Apple I shows `ESC`; TRS-80 shows `ESC`, `BREAK`, `CLEAR`, arrows; Altair shows `ESC`
- Buttons use `onTouchStart` with `e.preventDefault()` to avoid stealing focus from the hidden input
- After touch, dispatch synthetic KeyboardEvent on terminal container and re-focus hidden input
- Styled in terminal aesthetic: compact, dark bg, green border/text, ~36px tall

### visualViewport Keyboard Detection

```typescript
useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const onResize = () => {
    // visualViewport.height shrinks when keyboard appears
    setKeyboardHeight(window.innerHeight - vv.height);
  };
  vv.addEventListener('resize', onResize);
  return () => vv.removeEventListener('resize', onResize);
}, []);
```

The parent layout uses this height to shrink the terminal: `height: calc(100dvh - keyboardHeight - toolbarHeight)`.

## Mobile Overlay Design

**Trigger**: Floating action button (hamburger icon) in top-right corner, semi-transparent, `z-50`

**Sheet content** (slides from right via shadcn Sheet):
- **Machine selector**: Vertical radio-style list (Apple I, TRS-80, Altair 8800)
- **Actions**: RESET, LOAD SOFTWARE, COPY TERMINAL buttons
- **Current software**: Shows loaded program name
- **Machine spec**: Shows CPU/display info

Uses `lucide-react` icons (already installed): `Menu`, `RotateCcw`, `Download`, `Copy`.

When the Sheet opens, blur the hidden input (dismiss native keyboard) for full-screen overlay view. When Sheet closes, re-focus hidden input to restore keyboard.

## Altair 8800 on Mobile

The front panel (720px of tiny toggle switches) is impractical on mobile. On mobile:
- Hide `Altair8800Panel` component
- Add panel control buttons (RUN, STOP, EXAMINE, DEPOSIT, etc.) to the MobileOverlay Sheet
- Omit address/data toggle switches (users load software via the library instead)

## Implementation Order (for team parallelization)

1. **Foundation**: `useIsMobile` hook, install shadcn components, viewport meta in layout.tsx
2. **Responsive terminal**: `isMobile` prop on TerminalDisplay, flexible container sizing, `getContainer()` on TerminalHandle
3. **MobileInput**: Hidden input, `beforeinput`/`input` event handling, synthetic KeyboardEvent dispatch, special-key toolbar, visualViewport keyboard detection
4. **Mobile overlay**: MobileOverlay with Sheet, machine switching, action buttons, Altair panel controls
5. **Layout integration**: EmulatorPage mobile/desktop conditional layout, SoftwareLibraryModal responsive
6. **Polish & testing**: Browser testing with iPhone emulation via Chrome DevTools, verify no auto-scroll

## Verification

1. `npm run lint && npx tsc --noEmit && npx vitest run` — all pass
2. Chrome DevTools iPhone emulation: terminal fills viewport, native keyboard input works, no page scroll/shift
3. Desktop layout completely unchanged (regression check)
4. Each emulator: type characters via native keyboard, verify they appear in terminal
5. Special keys: ESC, Backspace, Enter, arrows all work via toolbar buttons
6. TRS-80 specifically: verify shifted characters work (e.g., `!`, `"`)
7. Keyboard appear/disappear: terminal resizes smoothly, no content hidden behind keyboard
8. MobileOverlay: machine switching, RESET, LOAD, COPY all functional
9. SoftwareLibraryModal: opens properly on mobile, close returns to emulator with keyboard restored
