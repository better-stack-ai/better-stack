# Newsletter delivery recovery evidence

Captured from the generated Next.js E2E app with the Newsletter package built at
`19320df821cefba2ba65af375ab7abeb4f71c7c1`. The subsequent fixture fix
`d6b81ee0` initializes the same test adapter state in React Router and TanStack.

The fixture creates a two-recipient campaign. Its local email adapter accepts
one message and simulates an interrupted provider response for the second. The
adapter has no reconciliation capability, so its uncertain result remains until
the manager explicitly records a verified outcome.

`newsletter-recipient-recovery.mp4` is a captioned browser recording:

1. Inspect the uncertain recipient beside one confirmed acceptance.
2. Check provider receipts; the unsupported reconciliation leaves it uncertain.
3. Explicitly confirm that the simulated request was not accepted.
4. Resume the eligible recipient and finish with two accepted messages.

The screenshots show each step. Every caption was checked against its frame.
The final API inventory also verifies that the original accepted recipient has
one attempt and the retried recipient has two. Each take seeds fresh recipients
and an isolated audience tag in the local memory-backed app.

Validation: one focused recovery E2E passed (2.1 seconds), the Next.js production
build and authorization-boundary check passed, and all three actual fixture
adapter scopes typechecked against the Newsletter `EmailAdapter` type.
The isolated local server uses port49175.
