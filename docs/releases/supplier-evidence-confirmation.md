# Supplier evidence and confirmation

Supplier reviews now retain original weight, MOQ and dimensions alongside the original offer and field-specific extraction sources. Combining direct, rendered and structured reads preserves currency, variant and price basis from the retained price; supplemental logistics cannot replace its evidence. Quantity-linked browser prices preserve the selected tier's original amount. Unknown values remain unknown and the existing editable confirmation remains the gate to calculation.

Currency conversion rejects unsupported currencies, invalid price bases, impossible calendar dates, invalid quantities and non-finite converted prices. Non-USD conversions require an editable rate, source and date.

Validation: 1,020 unit/integration tests and production build pass locally. Browser regression extends the existing ambiguous-currency case on Chromium and mobile WebKit: original 500 g evidence, unknown currency, blocked calculation, documented pack conversion and price-tier edits. CI and deployment results are tracked in the pull request. Provider browser cases use controlled responses; a real signed-in user session has not been verified in this release.
