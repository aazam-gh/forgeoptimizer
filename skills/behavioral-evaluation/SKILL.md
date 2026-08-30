# Behavioral evaluation

Before an optimization is accepted, prefer deterministic evaluation cases from
existing tests, schemas, fixtures, snapshots, and documented examples. Use
exact, JSON, schema, tolerance, subset, regex, snapshot, or HTTP assertions.
Never evaluate a replacement only against its own output; compare it with the
baseline result from the exact source commit.
