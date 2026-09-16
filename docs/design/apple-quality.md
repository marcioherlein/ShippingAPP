# ShippingAPP product design baseline

Adapt Apple HIG and the AppLlama product-quality principles to this responsive web app. Do not represent this as native iOS conformance.

References: https://developer.apple.com/design/human-interface-guidelines/ and https://github.com/Appllama/appllama-skills

## Applied in this release

- Platform typography (San Francisco where supplied by the OS), one display heading, readable body copy and tabular data.
- Existing indigo brand retained; neutral reading surfaces, restrained elevation and translucent navigation only.
- At least 44 CSS px button targets and 48 px primary controls; 16 px editable text avoids mobile Safari focus zoom at normal text size.
- Keyboard focus remains visible. Native dialog provides focus containment, Escape dismissal and return to trigger; the safe action receives initial focus.
- A new case or changed intent requires confirmation before discarding a live draft. Cancelling preserves both URL and persisted data. Programmatic history restoration remains noninteractive.
- Landing content yields to the active quotation. Current step has explicit aria-current semantics.
- Manual NCM selection has bounded scrolling, full-row selection, distinct selected state, recovery text for no matches and explicit instructions before confirmation.
- Reduced motion, reduced transparency and increased contrast preferences are handled. Safe-area padding uses environment insets.
- Shared CSS contract is in src/styles/product-quality.css, after legacy component styles.

## Verification and boundaries

CI exercises 390 and 1280 px layouts, keyboard cancellation, persisted draft preservation, text enlargement, reduced motion, accessibility and the existing complete manual intake flow. Screenshots are retained as browser-design-review artifacts for human/agent inspection.

Native haptics, SF Symbols distribution, UIKit/SwiftUI components, Dynamic Island and native navigation APIs do not apply to this web implementation. Dark mode, physical iPhone VoiceOver/Safari keyboard testing and a full screen-by-screen output/history/watchlist audit remain separate verification work. Do not claim all HIG guidelines are satisfied from this baseline or from passing Chromium alone.
