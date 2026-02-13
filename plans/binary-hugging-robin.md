# Fix Apple I Terminal Display Proportions

## Context
The Apple I terminal (40x24 chars) needs to look like a real Apple I CRT — chunky, wide characters filling a 4:3 display. VT323 font characters are naturally tall and narrow, so at a font size where 24 rows fit vertically, the text only fills ~60% of the container width. Static CSS approaches (letter-spacing, scaleX) haven't worked reliably.

## Approach: Dynamic Scale-to-Fit

Render the text at a large base font size (for chunky characters), measure its natural dimensions, then apply `transform: scale(scaleX, scaleY)` to fit the container exactly.

### Files to modify

1. **`src/app/globals.css`** — `.apple1-terminal` class:
   - Set font-size to 28px (large for chunky chars)
   - line-height: 1.0
   - Remove any letter-spacing or transforms
   - Keep font-family and color

2. **`src/components/TerminalDisplay.tsx`** — Apple I pre element:
   - Remove inline width/height/transform/margin styles from the pre
   - Add a `useEffect` + `useRef` to measure the pre's natural `scrollWidth` and `scrollHeight`
   - Calculate scale factors: `scaleX = availableWidth / naturalWidth`, `scaleY = availableHeight / naturalHeight`
   - Apply `transform: scale(scaleX, scaleY)` with `transform-origin: top left`
   - Available dimensions = container (720x540) minus header (~28px) and padding (~16px each side)
   - The pre should be positioned with small padding from edges

### Implementation detail

```tsx
// In Apple1Terminal component, after the refs:
const [termScale, setTermScale] = useState({ x: 1, y: 1 });

useEffect(() => {
  const pre = preRef.current;
  const container = containerRef.current;
  if (!pre || !container) return;
  const containerRect = container.getBoundingClientRect();
  const headerHeight = 28; // header bar
  const pad = 16;
  const availW = containerRect.width - pad * 2;
  const availH = containerRect.height - headerHeight - pad * 2;
  const natW = pre.scrollWidth;
  const natH = pre.scrollHeight;
  if (natW > 0 && natH > 0) {
    setTermScale({ x: availW / natW, y: availH / natH });
  }
}, [lines]); // recalc when content changes
```

Pre element:
```tsx
<pre
  ref={preRef}
  className="apple1-terminal"
  style={{
    transform: `scale(${termScale.x}, ${termScale.y})`,
    transformOrigin: "top left",
    position: "absolute",
    top: "44px", // header + padding
    left: "16px",
  }}
>
```

### Why this works
- Characters render at 28px (large and chunky)
- scaleX > 1 stretches them wider (matching the real Apple I's wide chars)
- scaleY < 1 compresses rows to fit the height
- Result: squat, wide characters filling the 4:3 frame — exactly like the reference

## Verification
1. Run `npx vitest run` — all tests should pass
2. Check browser at localhost:3100 — load Screen Fill Test
3. All 40x24 characters should fill the container edge-to-edge
4. Characters should look chunky and wide like the reference image
5. Verify TRS-80 tab is unaffected
