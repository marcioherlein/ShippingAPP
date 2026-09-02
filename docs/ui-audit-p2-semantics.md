# UI Audit P2 — Semantics and progression feedback

This batch addresses the highest-value residual FAIL items from issue #137 without changing the import engine or calculation flow.

## Changes

- Existing chip/button choices now expose equivalent radio semantics (`radiogroup`, `radio`, `aria-checked`).
- Arrow keys plus Home/End move and select within each choice group.
- Operation and budget groups receive accessible names derived from their visible prompt.
- Disabled progression buttons expose a visible contextual reason and include the reason in their accessible label.
- Core explanatory copy is promoted to a 16px body-text baseline while compact metadata remains separate.
- Existing browser tests were updated to assert the new roles instead of the old button-only semantics.
- New Playwright regressions cover radio grouping, arrow-key selection, disabled-action explanations, readable body size and axe scanning.

## Intentionally not included

- Browser/deep-link persistence remains a separate state-management problem.
- The underlying React state machine and landed-cost engine are unchanged.
- This batch does not convert the visual chips to literal `<input type="radio">`; it provides equivalent keyboard/ARIA semantics while preserving the current component structure.

Refs #137
