from __future__ import annotations

import pytest

from app.gateway.image_generation.contracts import (
    BBoxRegion,
    ImageInput,
    PointRegion,
    PromptCompilationError,
    PromptDocument,
    PromptReferenceSegment,
    PromptTextSegment,
)
from app.gateway.image_generation.prompt_compiler import compile_seedream_prompt


def test_compiles_reference_tokens_and_regions_in_input_order() -> None:
    document = PromptDocument(
        segments=(
            PromptTextSegment(text="保留"),
            PromptReferenceSegment(reference_id="ref-product", label="产品"),
            PromptTextSegment(text="，参考"),
            PromptReferenceSegment(reference_id="ref-style", label="风格"),
        )
    )
    inputs = (
        ImageInput(reference_id="ref-style", image="data:image/png;base64,style", order=1),
        ImageInput(reference_id="ref-product", image="data:image/png;base64,product", order=0),
    )
    regions = (
        PointRegion(reference_id="ref-product", x=120, y=340),
        BBoxRegion(reference_id="ref-style", x1=10, y1=20, x2=800, y2=900),
    )

    compiled = compile_seedream_prompt(document, inputs, regions)

    assert compiled.prompt == (
        "保留图1，参考图2\n"
        "图1<point>120 340</point>\n"
        "图2<bbox>10 20 800 900</bbox>"
    )
    assert compiled.images == (
        "data:image/png;base64,product",
        "data:image/png;base64,style",
    )


def test_rejects_reference_token_without_matching_image() -> None:
    document = PromptDocument(segments=(PromptReferenceSegment(reference_id="missing", label="缺失"),))

    with pytest.raises(PromptCompilationError, match="missing_reference") as exc_info:
        compile_seedream_prompt(document, (), ())

    assert exc_info.value.code == "missing_reference"


def test_rejects_duplicate_input_order() -> None:
    inputs = (
        ImageInput(reference_id="ref-1", image="image-1", order=0),
        ImageInput(reference_id="ref-2", image="image-2", order=0),
    )

    with pytest.raises(PromptCompilationError, match="duplicate_input_order") as exc_info:
        compile_seedream_prompt(PromptDocument(segments=()), inputs, ())

    assert exc_info.value.code == "duplicate_input_order"


@pytest.mark.parametrize(
    "region",
    [
        PointRegion(reference_id="ref-1", x=-1, y=0),
        PointRegion(reference_id="ref-1", x=0, y=1000),
        BBoxRegion(reference_id="ref-1", x1=0, y1=0, x2=1000, y2=999),
    ],
)
def test_rejects_region_coordinates_outside_official_range(region: PointRegion | BBoxRegion) -> None:
    inputs = (ImageInput(reference_id="ref-1", image="image-1", order=0),)

    with pytest.raises(PromptCompilationError, match="region_coordinate_out_of_range") as exc_info:
        compile_seedream_prompt(PromptDocument(segments=()), inputs, (region,))

    assert exc_info.value.code == "region_coordinate_out_of_range"


def test_rejects_more_than_ten_images() -> None:
    inputs = tuple(ImageInput(reference_id=f"ref-{index}", image=f"image-{index}", order=index) for index in range(11))

    with pytest.raises(PromptCompilationError, match="too_many_images") as exc_info:
        compile_seedream_prompt(PromptDocument(segments=()), inputs, ())

    assert exc_info.value.code == "too_many_images"
