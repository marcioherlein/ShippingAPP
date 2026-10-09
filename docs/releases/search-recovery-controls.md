# Search recovery controls — October 9, 2026

Supplier search and publication extraction expose distinct labels. Either stage
allows immediate cancellation or manual intake while the request is still waiting.
Cancellation propagates to transport, including stalled session-token lookup, and
late responses cannot replace the user's manual product. Classification still starts
only after explicit product confirmation.

Publication failures preserve the selected URL, original query, results and error
across reload. Retry reads that publication again instead of repeating supplier
discovery. Metered search retries retain the pending operation's idempotency key.
The existing 30-second deadline continues to cover the request and response body.

Local verification: 1,016 unit/integration tests passed; production build passed.
Browser coverage updates the extraction/reload retry regression and adds immediate
manual exit from a stalled search at 320px, selected for Chromium and mobile WebKit.
Those browser cases require CI completion before release. Controlled provider
responses do not establish that authenticated live Alibaba always succeeds.
