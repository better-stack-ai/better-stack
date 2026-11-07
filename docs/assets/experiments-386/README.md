# Experiment report evidence

These captures use synthetic traffic in a temporary local application running the
real Analytics dashboard, Feature Flags evaluation, Analytics ingestion, and
request authorization. The in-memory adapter was reset between the browser check
and recording. They do not show production traffic or statistically meaningful
results.

- `variant-report.png`: six exposed anonymous sessions per variant, with two and
  four converted sessions.
- `configuration-change.png`: changed saved weights produce a separate definition
  row; earlier samples remain separate.
- `demo.mp4`: explicit exposure, five deduplicated repeats, conversion, rejection
  of a stale displayed definition, then exposure to a new definition.

The browser obtains `tracker.getSessionId()`, evaluates the flag with that exact
session, displays the assigned variant, and passes the returned flag fingerprint
to `tracker.expose()`. Captions are burned into the recording. Each of its five
captured frames was inspected against its caption.

The focused Chromium check also verified anonymous report rejection (401), member
rejection (403), rendered assignment matching the exposure's report row, shared
exposure/conversion session, conversion deduplication, and no browser exceptions.
Only the focused browser flow and relevant unit files were run locally; GitHub
CI covers the complete suite.

The rollback regression added after recording verifies A → B → A activation
ownership while preserving A's first-exposure sample and original deadline.
The screenshots and video demonstrate a single configuration change; they do
not depict rollback attribution.
