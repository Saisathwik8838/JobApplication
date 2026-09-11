# Evaluation methodology

`npm run eval` runs deterministic eligibility fixtures from `scripts/fixtures/matcher-eval.json` and reports eligibility accuracy plus false-positive/negative rates. Add curated, consented examples before using results for tuning.

Match-classification accuracy compares a reviewed expected decision with the provider’s `recommendation`; it is intentionally not inferred from the deterministic labels. Hallucination rate is the number of generated claims rejected by `validateTruthLayer` divided by all generated claims. The test set should contain neither private job-board data nor unverified candidate facts.
