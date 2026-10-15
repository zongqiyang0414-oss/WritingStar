# WritingStar v0.9.1 preview repair

Based on deployed preview commit 870056c5d1deb8cc81999631147633e8cda4f311.

The original Vue/TypeScript v0.9 source was unavailable in this environment and the connected GitHub main. This patch changes the deployed preview's own application module, preserves its other v0.9 behavior, removes active parent roles, migrates existing learner bindings, and retains historical submissions. The script records the exact reproducible edits; it is not a mini-program source replacement.

Storage schema 5 upgrades to 6 without changing assignment, photo, draft or published feedback records. A valid student binding takes priority; otherwise a valid prior parent binding becomes the student binding. Prior parent binding metadata is retained as legacyParentAccount. Previously issued learner codes remain aliases for the student role; only current student codes are listed in the demo tools.
