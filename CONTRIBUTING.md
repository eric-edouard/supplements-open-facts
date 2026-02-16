# Contributing to Supplements Open Facts

Thank you for helping build an open-science supplement database backed by real research.

## Quick start

1. Fork the repo and create a branch.
2. Create your `.yml` claim files in the correct supplement folder, following the format described in the [README](README.md).
3. If you're adding a new supplement, create a new directory under `supplements/` with a `meta.yml` file.
4. If you're adding new vocabulary terms, add them to the relevant file in `vocab/`.
5. Run validation locally:
   ```bash
   npm install
   npm run validate
   ```
6. Open a pull request.

## Claim file guidelines

- Every claim must reference a DOI (`paper` field) that resolves to a real publication.
- Use controlled vocabulary from `vocab/effects.yml` and `vocab/biomarkers.yml` for the `effect` and `biomarker` fields.
- Follow the [file naming convention](README.md#file-naming-convention) — filenames are generated from claim content.
- Use ISO 8601 dates (`YYYY-MM-DD`) for the `created` field.

## Adding a new supplement

1. Create `supplements/<slug>/meta.yml` with required fields (`slug`, `name`, `dosage_unit`, `created`).
2. The `slug` must match the directory name (lowercase, alphanumeric, hyphens only).
3. Create the `claims/` subdirectory structure — the validation script expects claim files under typed subdirectories (`effects/`, `biomarkers/`, `cycles/`, `interactions/`, `formulations/`, `toxicity/`, `synergies/`, `addiction-withdrawal/`).

## CI gates

Every pull request is automatically validated:

- **JSON Schema** — all claim and meta files must conform to their schema.
- **DOI resolution** — every cited paper must resolve via Semantic Scholar or Crossref.
- **Vocabulary check** — effect and biomarker slugs must exist in the controlled vocabulary.
- **Filename check** — filenames must match the expected pattern based on claim content.
- **Duplicate detection** — flags duplicate claims (same DOI + same identifier).

Green ticks on all checks are required before human review and merge.

## Code of conduct

Be respectful, cite real papers, and keep the data honest. This project exists to make supplement evidence transparent and auditable — accuracy matters more than volume.
