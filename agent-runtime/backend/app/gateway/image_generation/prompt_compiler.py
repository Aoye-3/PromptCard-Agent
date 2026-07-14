from __future__ import annotations

from collections.abc import Sequence

from app.gateway.image_generation.contracts import (
    BBoxRegion,
    CompiledPrompt,
    ImageInput,
    ImageRegion,
    PointRegion,
    PromptCompilationError,
    PromptDocument,
    PromptReferenceSegment,
    PromptTextSegment,
)

MAX_REFERENCE_IMAGES = 10
REGION_COORDINATE_MIN = 0
REGION_COORDINATE_MAX = 999


def compile_seedream_prompt(
    document: PromptDocument,
    inputs: Sequence[ImageInput],
    regions: Sequence[ImageRegion],
) -> CompiledPrompt:
    if len(inputs) > MAX_REFERENCE_IMAGES:
        raise PromptCompilationError("too_many_images", "Seedream accepts at most 10 images")

    orders = [image_input.order for image_input in inputs]
    if len(orders) != len(set(orders)):
        raise PromptCompilationError("duplicate_input_order", "Image input order must be unique")
    if any(not _is_coordinate(order) or order < 0 for order in orders):
        raise PromptCompilationError("invalid_input_order", "Image input order must be a non-negative integer")

    ordered_inputs = tuple(sorted(inputs, key=lambda image_input: image_input.order))
    reference_ids = [image_input.reference_id for image_input in ordered_inputs]
    if len(reference_ids) != len(set(reference_ids)):
        raise PromptCompilationError("duplicate_reference_id", "Image reference IDs must be unique")
    if any(not image_input.reference_id or not image_input.image for image_input in ordered_inputs):
        raise PromptCompilationError("invalid_image_input", "Image inputs require a reference ID and image")

    labels = {image_input.reference_id: f"图{index}" for index, image_input in enumerate(ordered_inputs, start=1)}
    prompt_parts: list[str] = []
    for segment in document.segments:
        if isinstance(segment, PromptTextSegment):
            prompt_parts.append(segment.text)
            continue
        if isinstance(segment, PromptReferenceSegment):
            prompt_parts.append(_label_for(segment.reference_id, labels))
            continue
        raise PromptCompilationError("invalid_prompt_segment", "Unsupported prompt segment")

    region_lines = [_compile_region(region, labels) for region in regions]
    prompt = "".join(prompt_parts)
    if region_lines:
        prompt = "\n".join(([prompt] if prompt else []) + region_lines)

    return CompiledPrompt(prompt=prompt, images=tuple(image_input.image for image_input in ordered_inputs))


def _compile_region(region: ImageRegion, labels: dict[str, str]) -> str:
    label = _label_for(region.reference_id, labels)
    if isinstance(region, PointRegion):
        _validate_coordinates(region.x, region.y)
        return f"{label}<point>{region.x} {region.y}</point>"
    if isinstance(region, BBoxRegion):
        _validate_coordinates(region.x1, region.y1, region.x2, region.y2)
        if region.x1 >= region.x2 or region.y1 >= region.y2:
            raise PromptCompilationError("invalid_bbox", "Bounding box minimums must be less than maximums")
        return f"{label}<bbox>{region.x1} {region.y1} {region.x2} {region.y2}</bbox>"
    raise PromptCompilationError("invalid_region", "Unsupported region type")


def _label_for(reference_id: str, labels: dict[str, str]) -> str:
    try:
        return labels[reference_id]
    except KeyError as error:
        raise PromptCompilationError("missing_reference", f"No image input for reference ID {reference_id!r}") from error


def _validate_coordinates(*coordinates: int) -> None:
    if any(not _is_coordinate(value) or not REGION_COORDINATE_MIN <= value <= REGION_COORDINATE_MAX for value in coordinates):
        raise PromptCompilationError("region_coordinate_out_of_range", "Region coordinates must be integers from 0 to 999")


def _is_coordinate(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)
