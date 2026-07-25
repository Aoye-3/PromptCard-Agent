# Image Operation Evaluations

This directory versions product-recipe evaluation definitions separately from provider capabilities and adapter contract tests.

An operation can be executable and labelled `experimental` before a live quality set has passed. It must not be labelled `ready` until a dated result records the exact model, recipe version, fixtures, reviewer, pass criteria, and known failures.

The current implementation uses Seedream as its first adapter and benchmark. Recipe IDs, operation snapshots, frontend state, and evaluation dimensions remain provider-neutral.

## Evidence layers

1. Official provider documentation establishes native primitives and limits.
2. Catalog and adapter tests establish that PromptCard maps those primitives correctly.
3. The manifests in this directory define product-quality checks.
4. Dated result files record actual executions. Absence of a result is not a pass.

Official sources used by the initial manifest:

- [Seedream 5.0 Pro tutorial](https://www.volcengine.com/docs/82379/2582774?lang=zh)
- [Seedream 5.0 Pro interactive editing](https://www.volcengine.com/docs/82379/2582775?lang=zh)
- [Seedream 4.0–5.0 prompt guide](https://www.volcengine.com/docs/82379/1829186)
- [Volcengine Ark ImageGenerations API](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)

Competitor screenshots and generated Plan previews are excluded from capability evidence. They are interaction references only.
