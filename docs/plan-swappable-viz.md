# Plan: Swappable Lottery Visualizations

## Context

The current `Lottery.js` (344 lines) mixes probability/selection logic, D3 visualization, and UI controls into one monolithic component. This makes it impossible to swap in alternative visualizations. We want to:

1. Decompose the component so visualizations are pluggable
2. Add a **force-directed bubble chart** as the new default visualization
3. Keep the existing radial wheel as an option
4. (Stretch) Add a word cloud visualization

Algorithm improvements are **deferred to v2** — not in scope here.

---

## Step 0: Git setup [DONE]

- ~~Commit current state on `master`~~
- ~~Create and checkout branch `improve-lottery-viz`~~

## Step 1: Extract `useLotteryEngine` hook [DONE]

**Created** `front/src/lottery/useLotteryEngine.js`

Extracted from `Lottery.js`:
- State: `adjust`, `avoidRepetition`, `adjustByVariable`
- `ADJUSTMENT_FACTOR` constant
- `getDCounts()` — as `useMemo`
- `getOptionsFromCounts()` — as `useCallback`
- `updateAllOptions()` — as `useMemo` computing `allOptions` + `optionsLeft`
- `onChoose()` — without the `angleScale` mutation (viz-specific)
- Toggle handlers: `onAdjustByHistory`, `onAdjustByVariable`, `onAvoidRepetition`

Added a computed `probability` field (normalized 0-1) to each student for the bubble viz.

Hook signature:
```js
useLotteryEngine({ options, counts, optionsDrawn, setOptionSel })
// Returns: { adjust, avoidRepetition, adjustByVariable,
//            students, studentsLeft, allOptions, optionsLeft, dCounts, drawnMap,
//            onChoose, onAdjustByHistory, onAdjustByVariable, onAvoidRepetition }
```

## Step 2: Create `LotteryShell` container [DONE]

**Created** `front/src/lottery/LotteryShell.js` + `LotteryShell.css`

- Calls `useLotteryEngine(props)` for all logic
- Manages `vizType` state (`"bubbles"` | `"radial"`)
- Renders shared UI: "Do you feel lucky?" button, checkboxes, radio buttons
- Renders a small `btn-group` toggle to switch visualizations
- Renders the active visualization component, passing the standard props
- Measures available vertical space via `vizContainerRef` + `useEffect` resize listener
- Includes a radius slider (Size) for the bubble visualization

## Step 3: Create visualization registry [DONE]

**Created** `front/src/lottery/visualizations/index.js`

```js
{ bubbles: { component: BubbleForce, label: "Bubbles" },
  radial:  { component: RadialWheel, label: "Wheel" } }
```

## Step 4: Extract `RadialWheel` from current D3 code [DONE]

**Created** `front/src/lottery/visualizations/RadialWheel.js` + `RadialWheel.css`

Ported `redraw()` and `angleScale` logic. Key changes:
- Module-level `angleScale` and `resetAngleScale` became `useRef` (instance-scoped)
- Receives standardized props instead of closure variables
- Styles moved from `Lottery.css` to `RadialWheel.css`

## Step 5: Build `BubbleForce` visualization [DONE]

**Created** `front/src/lottery/visualizations/BubbleForce.js` + `BubbleForce.css`

Design:
- Each student = a circle with their name and call count inside
- Circle **size** proportional to selection probability (`d3.scaleSqrt`); uniform when adjust is off
- Circle **color** gradient by call count (`d3.scaleSequential` with `d3.interpolateRdYlBu`)
- Drawn students dimmed (opacity 0.3)
- Selected student highlighted with gold stroke + pulse animation
- React-owned `<svg>`, D3 operates via `useRef`/`useEffect` (same pattern as `LotteryChart.js`)
- Names split into multiple `<tspan>` lines to fit inside circles
- Contrast-aware text color (white on dark backgrounds, dark on light)
- Legend showing color = times called, size = selection chance (size legend hidden when adjust off)

Force simulation (d3-force, included in d3 v5):
- `forceCenter` for centering
- `forceCollide` sized to each circle's radius + padding
- Aspect-ratio-aware `forceX`/`forceY` (weaker along the longer axis for better distribution)
- Slow `alphaDecay` for floaty feel
- Simulation stored in `useRef`, stopped on unmount via `useEffect` cleanup
- On selection: reheat simulation briefly, pulse the selected bubble
- Radius bounds computed dynamically from student count + available area

## Step 6: Wire up `Lottery.js` as thin re-export [DONE]

**Modified** `front/src/Lottery.js` to:
```js
export { default } from "./lottery/LotteryShell";
```

`MainPage.js` requires **zero changes** — its `import Lottery from "../Lottery"` still resolves.

## Step 7: (Stretch) Word cloud visualization [TODO]

- Install `d3-cloud` dependency
- Create `front/src/lottery/visualizations/WordCloud.js`
- Register in `visualizations/index.js`

---

## Visualization Props Contract

Every visualization component receives:

| Prop | Type | Description |
|------|------|-------------|
| `students` | `StudentData[]` | All students with `name`, `id`, `drawn`, `count`, `sum`, `adjustedCount`, `probability` |
| `studentsLeft` | `StudentData[]` | Students eligible for selection |
| `selectedStudent` | `object \| null` | Currently selected student |
| `drawnMap` | `object` | `{ name: true }` hash of drawn students |
| `allOptions` | `array` | Full weighted options array (used by RadialWheel) |
| `dCounts` | `Map` | Student count data (used by RadialWheel) |
| `avoidRepetition` | `bool` | Whether to dim drawn students (used by RadialWheel) |
| `adjust` | `bool` | Whether history adjustment is on (used by BubbleForce) |
| `radiusScale` | `number` | Manual radius multiplier from slider (used by BubbleForce) |
| `width` | `number` | Container width |
| `height` | `number` | Container height |

---

## Files Summary

| File | Action | Status |
|------|--------|--------|
| `front/src/lottery/useLotteryEngine.js` | Create | DONE |
| `front/src/lottery/LotteryShell.js` | Create | DONE |
| `front/src/lottery/LotteryShell.css` | Create | DONE |
| `front/src/lottery/visualizations/index.js` | Create | DONE |
| `front/src/lottery/visualizations/RadialWheel.js` | Create | DONE |
| `front/src/lottery/visualizations/RadialWheel.css` | Create | DONE |
| `front/src/lottery/visualizations/BubbleForce.js` | Create | DONE |
| `front/src/lottery/visualizations/BubbleForce.css` | Create | DONE |
| `front/src/Lottery.js` | Modify (thin re-export) | DONE |
| `front/src/Lottery.css` | Delete (styles moved) | DONE |
| `front/src/pages/MainPage.js` | No change | N/A |
| `front/src/lottery/visualizations/WordCloud.js` | Create | TODO |

## Algorithm Fairness

The selection algorithm is **unchanged** from the original. `onChoose` picks uniformly at random from the weighted `optionsLeft` pool. The visualization is a pure display layer — bubble sizes visualize the same probabilities used for selection but do not influence it.
