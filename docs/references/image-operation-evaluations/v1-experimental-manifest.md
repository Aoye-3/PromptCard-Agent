# Image Operation Evaluation Manifest v1

## Status

- Manifest version: `1`
- Created: `2026-07-24`
- Execution status: `not-run`
- Product rollout status: `experimental`
- Current benchmark adapter: Seedream
- Live provider calls performed by this implementation task: `none`

This file defines representative checks; it does not claim that Seedream or another model passed them. A live run requires explicit cost authorization and a separate dated result file.

## Shared fixture classes

| Fixture ID | Content | Primary risk |
| --- | --- | --- |
| `product-chair-front` | one product on a plain background | identity, proportion, unseen surfaces |
| `interior-plan-small` | labelled interior plan | geometry, text, room relationships |
| `poster-cjk-latin` | mixed CJK/Latin poster text | exact text and layout |
| `portrait-occlusion` | person with hair and partial occlusion | boundary quality, identity |
| `street-object-removal` | object over textured street background | fill continuity |
| `canvas-crop-flip-annotation` | cropped, flipped, annotated canvas image | visible-input fidelity |

## Operation checks

### Effect render — `effect-render/*/v1`

- Inputs: product sketch and interior plan.
- Inspect: main silhouette, material/color intent, perspective, text corruption, introduced objects.
- Pass-to-ready threshold: no critical identity or topology failure in the agreed representative set; limitations remain visible.
- Known risk: a higher-fidelity render may still alter exact geometry, dimensions, labels, logos, or floor-plan relationships.

### Region redraw and erase — `region-redraw/*/v1`, `erase/*/v1`

- Inputs: point/bbox-guided target on textured and plain backgrounds.
- Inspect: target selection, changes outside the requested region, fill seams, duplicated objects.
- Pass-to-ready threshold: requested target consistently changes while protected areas remain acceptably stable.
- Known risk: point and bbox are guidance, not pixel masks. The model may change nearby content.

### Outpaint — `outpaint/*/v1`

- Inputs: portrait, product, and interior at multiple requested aspect ratios.
- Inspect: subject drift, perspective continuity, repeated structures, border seams.
- Pass-to-ready threshold: expanded area is coherent and original visible area remains acceptably stable.
- Known risk: generated unseen context is invented.

### Text edit — `text-edit/*/v1`

- Inputs: single-line Latin, single-line CJK, mixed script, multiline layout, and logo-like lettering.
- Inspect: exact requested characters, spelling, line breaks, font approximation, surrounding layout.
- Pass-to-ready threshold: exact text and layout criteria pass on the agreed set.
- Known risk: the current recipe is generative image editing, not deterministic OCR/typesetting. It remains experimental.

### Multi-view — `multi-view/identity-preserving/v1`

- Inputs: product and character fixtures.
- Views: front, front 3/4, left, right, rear.
- Inspect: identity, proportions, colors/materials, background consistency, contradictions between unseen surfaces.
- Pass-to-ready threshold: agreed cross-view identity score passes without describing the output as 3D reconstruction.
- Known risk: every view is an independent AI-inferred request. Partial failure and cross-view inconsistency are expected product states.

### Generative enhance — `upscale/generative-redraw/v1`

- Inputs: low-resolution product, portrait, and text-bearing image.
- Inspect: output dimensions, invented detail, face drift, text corruption, edge halos.
- Pass-to-ready threshold: useful detail improvement without critical identity/content regression.
- Known risk: this is generative redraw, not a native pixel-preserving upscale.

### Subject extract — `subject-extract/white-background/v1`

- Inputs: person with hair, product with fine edges, translucent object, and occluded subject.
- Inspect: subject identity, edge loss, background residue, hallucinated contour.
- Pass-to-ready threshold: agreed white-background redraw criteria pass.
- Known risk: current output is a clean solid-background redraw. It is not labelled as transparent alpha extraction.

## Result-file requirements

A dated result file must include:

- provider, deployment/model ID and documented version;
- adapter and catalog revision;
- recipe IDs and versions;
- fixture asset hashes or durable project fixture IDs;
- full pass/fail dimensions without secrets or temporary URLs;
- reviewer and date;
- cost/request count;
- known failures and rollout recommendation.
