import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DOCX_PATH = next(ROOT.glob("*.docx"))
OUT_JSON = ROOT / "data" / "motion-prompt-expansion-library.json"
OUT_MD = ROOT / "docs" / "motion-prompt-expansion-review.md"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


UNIT_CATEGORIES = [
    ("camera.basic_push_pull", "基础推拉变焦"),
    ("camera.character_composition", "角色定位构图"),
    ("camera.environment_interaction", "障碍物与环境互动"),
    ("camera.focus_control", "焦点与镜头操控"),
    ("camera.tripod_pan_tilt", "三脚架固定基础"),
    ("camera.slider_lateral", "滑轨横向"),
    ("camera.orbit", "环绕"),
    ("camera.vertical_lift", "垂直升降"),
    ("camera.optical_zoom", "光学镜头特效"),
    ("camera.drone_aerial", "无人机/航拍"),
    ("camera.stylized_dynamic", "风格化动态"),
    ("camera.subject_tracking", "主体追踪"),
    ("camera.time_speed", "时间与速度操控"),
    ("camera.extreme_perspective", "极端定向与透视"),
    ("camera.ai_space_breakthrough", "AI空间物理突破"),
    ("camera.ai_time_control", "AI时间维度操控"),
    ("camera.ai_optical_perspective", "AI光学与透视突破"),
    ("camera.seamless_transition", "运镜转场一体化"),
    ("camera.emotion_narrative", "强情绪与叙事"),
    ("camera.dimension_logic", "维度与空间逻辑突破"),
    ("camera.xuanhuan_animation", "玄幻/动画叙事"),
    ("camera.combat_xuanhuan", "国漫玄幻打斗"),
]

GLOBAL_SUFFIX = "全程画面主体清晰，不要生成背景音乐和字幕、无黑屏、无穿帮、无内容崩坏，严格遵循指定镜头运动规则"
CAMERA_CONTENT_REMOVALS = [
    "\n" + GLOBAL_SUFFIX,
    GLOBAL_SUFFIX,
    "全程无停顿。",
]


def qn(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


def text_of(el: ET.Element) -> str:
    return "".join(t.text or "" for t in el.iter(qn("t"))).strip()


def paragraph_style(p_el: ET.Element) -> str:
    p_pr = p_el.find(qn("pPr"))
    if p_pr is None:
        return ""
    p_style = p_pr.find(qn("pStyle"))
    if p_style is None:
        return ""
    return p_style.attrib.get(qn("val"), "")


def table_rows(tbl: ET.Element) -> list[list[str]]:
    rows = []
    for tr in tbl.findall(qn("tr")):
        row = []
        for tc in tr.findall(qn("tc")):
            cell_paras = [text_of(p) for p in tc.findall(qn("p"))]
            row.append("\n".join(p for p in cell_paras if p))
        rows.append(row)
    return rows


def slugify_label(label: str) -> str:
    # Stable, readable enough for review files while avoiding extra dependencies.
    base = re.sub(r"[^0-9A-Za-z]+", "-", label).strip("-").lower()
    return base or "item"


def strip_unit_count(unit: str) -> str:
    return re.sub(r"^\d+\.\s*", "", re.sub(r"（\d+\s*种）", "", unit)).strip()


def clean_camera_content(content: str) -> str:
    for phrase in CAMERA_CONTENT_REMOVALS:
        content = content.replace(phrase, "")
    if content.startswith("4K ") and "固定场景：" in content:
        content = content.split("固定场景：", 1)[1]
    elif content.startswith("4K ") and "起始场景：" in content:
        content = "起始场景：" + content.split("起始场景：", 1)[1]
    return content.replace("\n\n", "\n").strip()


def parse_docx() -> tuple[list[dict], dict]:
    with zipfile.ZipFile(DOCX_PATH) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))

    body = root.find("w:body", NS)
    if body is None:
        raise RuntimeError("Missing document body")

    current_system = ""
    current_unit = ""
    current_scene = ""
    unit_index = -1
    current_category = UNIT_CATEGORIES[0]
    presets = []
    modules = []
    stats = Counter()

    for child in list(body):
        if child.tag == qn("p"):
            text = text_of(child)
            if not text:
                continue

            style = paragraph_style(child)
            if style == "1":
                stats["titles"] += 1
            elif style == "2":
                current_system = text
            elif style == "3":
                current_unit = text
                current_scene = ""
                if re.match(r"^\d+\.", text) or text.startswith("单元"):
                    unit_index += 1
                    current_category = UNIT_CATEGORIES[min(unit_index, len(UNIT_CATEGORIES) - 1)]
            elif "固定前缀" in text:
                modules.append(
                    {
                        "id": "motion-module-global-prefix",
                        "type": "constraint",
                        "category": "video.global_prefix",
                        "label": "运镜全库通用固定前缀",
                        "content": "",
                        "usageCount": 0,
                        "meta": {
                            "sourceDoc": DOCX_PATH.name,
                            "moduleRole": "globalPrefix",
                        },
                    }
                )
            elif "固定后缀" in text:
                modules.append(
                    {
                        "id": "motion-module-global-suffix",
                        "type": "constraint",
                        "category": "video.global_suffix",
                        "label": "运镜全库通用固定后缀",
                        "content": "",
                        "usageCount": 0,
                        "meta": {
                            "sourceDoc": DOCX_PATH.name,
                            "moduleRole": "globalSuffix",
                        },
                    }
                )
            elif "固定统一场景" in text or "本单元固定场景" in text:
                current_scene = text
            elif modules and modules[-1]["content"] == "" and modules[-1]["meta"]["moduleRole"] in {
                "globalPrefix",
                "globalSuffix",
            }:
                modules[-1]["content"] = text

        elif child.tag == qn("tbl"):
            rows = table_rows(child)
            if len(rows) < 2:
                continue

            category, category_label = current_category
            unit_label = strip_unit_count(current_unit)

            for row_index, row in enumerate(rows[1:], start=1):
                if len(row) >= 5 and row[0].strip().isdigit():
                    source_seq = int(row[0].strip())
                    label = row[1].strip()
                    core_motion = row[2].strip()
                    teaching_use = row[3].strip()
                    content = clean_camera_content(row[4].strip())
                    item_id = f"motion-{source_seq:03d}-{slugify_label(label)}"
                    extra_meta = {}
                elif len(row) >= 4 and row[0].strip():
                    source_seq = None
                    label = row[0].strip()
                    core_motion = row[1].strip()
                    teaching_use = row[2].strip()
                    content = clean_camera_content(row[3].strip())
                    item_id = f"motion-combat-{row_index:02d}-{slugify_label(label)}"
                    extra_meta = {"sourceSeq": None, "combatUnitIndex": row_index}
                else:
                    continue

                presets.append(
                    {
                        "id": item_id,
                        "type": "camera",
                        "category": category,
                        "label": label,
                        "content": content,
                        "usageCount": 0,
                        "meta": {
                            "sourceDoc": DOCX_PATH.name,
                            "sourceSeq": source_seq,
                            "system": current_system,
                            "unit": unit_label,
                            "unitRaw": current_unit,
                            "categoryLabel": category_label,
                            "scene": current_scene,
                            "duration": "10秒",
                            "fps": "60fps",
                            "resolution": "4K",
                            "coreMotion": core_motion,
                            "teachingUse": teaching_use,
                            "promptMode": "full",
                            "reviewStatus": "pending",
                            **extra_meta,
                        },
                    }
                )

    return modules + presets, {
        "docx": DOCX_PATH.name,
        "modules": len(modules),
        "cameraPresets": len(presets),
        "total": len(modules) + len(presets),
    }


def write_json(presets: list[dict], stats: dict) -> None:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "source": stats["docx"],
        "purpose": "review-only expansion library; not merged into the active prompt library",
        "stats": stats,
        "presets": presets,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_markdown(presets: list[dict], stats: dict) -> None:
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    camera_items = [p for p in presets if p["type"] == "camera"]
    grouped: dict[str, list[dict]] = defaultdict(list)
    for item in camera_items:
        grouped[item["category"]].append(item)

    lines = [
        "# 运镜提示词扩充库审核清单",
        "",
        f"- 来源文件：`{stats['docx']}`",
        f"- 通用模块：{stats['modules']} 条",
        f"- 运镜条目：{stats['cameraPresets']} 条",
        f"- 总计：{stats['total']} 条",
        "- 状态：审核用扩充库，尚未合并到当前 Prompt 库",
        "",
        "## 通用模块",
        "",
    ]

    for item in presets:
        if item["type"] != "camera":
            lines.append(f"- `{item['category']}` / {item['label']}：{item['content']}")

    lines.extend(["", "## 按类目拆解", ""])

    for category, items in grouped.items():
        label = items[0]["meta"].get("categoryLabel", category)
        unit = items[0]["meta"].get("unit", "")
        system = items[0]["meta"].get("system", "")
        lines.extend(
            [
                f"### {category}｜{label}",
                "",
                f"- 原始单元：{unit}",
                f"- 所属体系：{system}",
                f"- 条目数：{len(items)}",
                "",
                "| 序号 | 名称 | 教学作用 |",
                "| --- | --- | --- |",
            ]
        )
        for item in items:
            seq = item["meta"].get("sourceSeq") or f"combat-{item['meta'].get('combatUnitIndex')}"
            teaching = item["meta"].get("teachingUse", "").replace("\n", " ")
            lines.append(f"| {seq} | {item['label']} | {teaching} |")
        lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")


def verify(presets: list[dict]) -> None:
    ids = [p["id"] for p in presets]
    if len(ids) != len(set(ids)):
        duplicates = [item for item, count in Counter(ids).items() if count > 1]
        raise RuntimeError(f"Duplicate ids: {duplicates}")

    camera_items = [p for p in presets if p["type"] == "camera"]
    numbered = sorted(
        p["meta"]["sourceSeq"]
        for p in camera_items
        if isinstance(p["meta"].get("sourceSeq"), int)
    )
    if numbered != list(range(1, 112)):
        raise RuntimeError("Numbered motion entries are not 1-111")

    combat = [p for p in camera_items if p["meta"].get("sourceSeq") is None]
    if len(combat) != 6:
        raise RuntimeError(f"Expected 6 combat entries, got {len(combat)}")


def main() -> None:
    presets, stats = parse_docx()
    verify(presets)
    write_json(presets, stats)
    write_markdown(presets, stats)
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
