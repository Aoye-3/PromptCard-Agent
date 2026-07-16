# ADR-011: Preserve Original Images And Use Permanent Provider Derivatives

- Status: Accepted
- Date: 2026-07-16
- Owners: PromptCard frontend, PromptCard Storage, and Agent Runtime

## Context

Seedream 5.0 Pro accepts JPEG, PNG, WebP, BMP, TIFF, GIF, HEIC, and HEIF inputs, but browsers, previews, annotation canvases, and provider adapters do not decode all of those formats consistently. Replacing an upload with a conversion would lose the user's source file, while converting only in memory would make generation replay and permanent history unverifiable.

Visual markup adds a second requirement: freehand, arrow, rectangle, ellipse, and text annotations must remain editable as structured data, while the provider receives a flattened raster image. This is image guidance, not a native mask-upload contract.

## Decision

1. PromptCard Storage schema v5 permanently stores the original upload and records every derived image in `image_asset_derivations`.
2. PNG, JPEG, and WebP may be reused directly when decoding and EXIF orientation require no conversion.
3. BMP, TIFF, GIF, HEIC, and HEIF produce standard provider derivatives. GIF/TIFF use the first frame/page, EXIF orientation is applied, alpha produces PNG, and opaque content produces high-quality JPEG.
4. Derivation kinds are `preview`, `provider-input`, and `annotation-flattened`. Both source and derived assets are strong references for diagnostics, backup, and restore.
5. `ImageAnnotationDocument` remains non-destructive. Submission rasterizes the current document to a new local asset and records an `annotation-flattened` derivation before Runtime invocation.
6. Import validates 30 MB, 36 million pixels, sides greater than 14 pixels, and aspect ratio `1:16–16:1`. The Runtime independently validates the provider derivative before reading credentials.
7. HEIC/HEIF decoding is supplied by the locked workspace dependency `pillow-heif==1.4.0`. Storage and Agent Runtime share the repository-local `.python`, `.venv`, and `.uv-cache`; maintained launchers do not fall back to a Python environment on another drive.
8. Derivations have no ordinary DELETE endpoint. A future regulated erasure flow must delete source, derivatives, history references, and physical files as one separately designed operation.

## Consequences

- Permanent history can explain which original and flattened inputs produced a run.
- Browser compatibility does not determine the durable source format.
- Storage usage increases because originals and derivatives coexist.
- Provider adapters consume standard local derivatives and remain independent of HEIC/TIFF/GIF decoding.
- A code rollback cannot downgrade Storage below schema v5 without preserving derivation reads and strong references.

## Alternatives considered

### Replace the original with a converted JPEG/PNG

Rejected because it destroys source fidelity and prevents future reprocessing with improved conversion.

### Convert only in frontend memory

Rejected because the exact provider input would not survive reload, history inspection, backup, or crash recovery.

### Send every original directly to Ark

Rejected because preview/annotation support remains inconsistent and the Runtime needs one validated, replayable provider input boundary.
