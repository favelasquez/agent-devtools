from __future__ import annotations

from math import sin, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "readme-flow.gif"

W, H = 1480, 860
FPS = 12
FRAMES = 54

BG = (13, 17, 23)
HEADER = (22, 27, 34)
PANEL = (13, 17, 23)
BORDER = (48, 54, 61)
TEXT = (224, 224, 224)
MUTED = (136, 136, 136)
ACCENT = (88, 166, 255)
GOOD = (63, 185, 80)
WARN = (233, 69, 96)
GOLD = (255, 213, 79)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        ("/System/Library/Fonts/Supplemental/SFNSMono.ttf", 0),
        ("/System/Library/Fonts/Supplemental/Menlo.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Menlo.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Supplemental/Courier New Bold.ttf", 0),
        ("/System/Library/Fonts/Supplemental/Courier New.ttf", 0),
    ]
    for path, index in candidates:
        try:
            return ImageFont.truetype(path, size=size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


F_TITLE = font(24, True)
F_HEAD = font(18, True)
F_BODY = font(14)
F_SMALL = font(12)
F_TINY = font(11)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, ft: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=ft)
    return box[2] - box[0], box[3] - box[1]


def draw_header(draw: ImageDraw.ImageDraw, t: float) -> None:
    rounded(draw, (0, 0, W - 1, 56), 0, HEADER)
    draw.line((0, 55, W, 55), fill=BORDER, width=1)

    draw.text((26, 18), "Agent DevTools", font=F_HEAD, fill=WARN)
    pulse = int(140 + 90 * (0.5 + 0.5 * sin(t * 2 * pi)))
    draw.text((190, 20), "● connected", font=F_SMALL, fill=(GOOD[0], min(255, pulse), GOOD[2]))

    tab_y = 14
    rounded(draw, (W - 202, tab_y, W - 120, tab_y + 28), 5, PANEL, BORDER, 1)
    draw.text((W - 178, tab_y + 8), "Events", font=F_SMALL, fill=MUTED)
    rounded(draw, (W - 112, tab_y, W - 26, tab_y + 28), 5, (13, 32, 68), ACCENT, 1)
    draw.text((W - 85, tab_y + 8), "Flow", font=F_SMALL, fill=ACCENT)


def draw_flow_heading(draw: ImageDraw.ImageDraw) -> None:
    draw.text((68, 94), "FLOW PREVIEW", font=F_TITLE, fill=TEXT)
    draw.text((70, 126), "conversation -> tools -> response", font=F_SMALL, fill=MUTED)


def tool_color(tool_type: str) -> tuple[int, int, int]:
    return {
        "web": ACCENT,
        "bash": GOOD,
        "file": GOLD,
        "other": WARN,
    }.get(tool_type, WARN)


def draw_tool_card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    input_text: str,
    kind: str,
    selected: bool,
) -> None:
    accent = tool_color(kind)
    fill = (22, 27, 34) if selected else (15, 21, 29)
    rounded(draw, box, 8, fill, accent if selected else BORDER, 1)
    draw.line((box[0] + 2, box[1] + 2, box[0] + 2, box[3] - 2), fill=accent, width=3)
    draw.text((box[0] + 14, box[1] + 11), title, font=F_SMALL, fill=TEXT)
    draw.text((box[0] + 14, box[1] + 33), input_text, font=F_TINY, fill=MUTED)


def draw_result_panel(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, mode: str) -> int:
    h = 128
    rounded(draw, (x, y, x + width, y + h), 7, (22, 27, 34), BORDER, 1)
    if mode == "web":
        rounded(draw, (x + 10, y + 10, x + width - 10, y + 34), 4, (33, 38, 45))
        draw.text((x + 20, y + 18), "http://music-blog.example/interviews/nowhere-man", font=F_TINY, fill=MUTED)
        draw.text((x + 18, y + 48), "Entrevista: el cantante dijo que compuso la cancion en su auto.", font=F_SMALL, fill=TEXT)
        draw.text((x + 18, y + 70), "Menciona una frase: \"tarde lluviosa, libreta y estacionamiento vacio\".", font=F_SMALL, fill=TEXT)
    elif mode == "bash":
        rounded(draw, (x + 10, y + 10, x + width - 10, y + 34), 4, (25, 25, 25))
        draw.text((x + 20, y + 18), "bash - rg -n \"Nowhere Man\" notes.txt", font=F_TINY, fill=MUTED)
        draw.text((x + 18, y + 48), "42: 1965, escrita durante una pausa en el coche.", font=F_SMALL, fill=GOOD)
        draw.text((x + 18, y + 70), "73: demo inicial grabado la misma noche.", font=F_SMALL, fill=GOOD)
    else:
        draw.text((x + 18, y + 18), "No result yet...", font=F_SMALL, fill=MUTED)
    return h


def draw_flow_step(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    step: dict,
    stage_t: float,
    show_line: bool,
    selected_tool: str | None,
) -> int:
    dot_x = x + 8
    content_x = x + 30
    content_w = width - 30

    dot_color = GOOD if stage_t >= 1.0 else WARN
    draw.ellipse((dot_x - 7, y + 4, dot_x + 7, y + 18), fill=dot_color)
    if show_line:
        draw.line((dot_x, y + 20, dot_x, y + 190), fill=BORDER, width=2)

    rounded(draw, (content_x, y, content_x + content_w, y + 42), 7, (15, 21, 29), BORDER, 1)
    draw.text((content_x + 12, y + 11), step["time"], font=F_TINY, fill=MUTED)
    draw.text((content_x + 96, y + 11), step["model"], font=F_TINY, fill=ACCENT)
    draw.text((content_x + 328, y + 11), step["tokens"], font=F_TINY, fill=GOLD)
    stop = step["stop"]
    sw, _ = text_size(draw, stop, F_TINY)
    rounded(draw, (content_x + content_w - 30 - sw, y + 9, content_x + content_w - 14, y + 29), 10, PANEL, GOOD if stop == "end_turn" else WARN, 1)
    draw.text((content_x + content_w - 24 - sw, y + 14), stop, font=F_TINY, fill=GOOD if stop == "end_turn" else WARN)

    tools = step.get("tools", [])
    current_y = y + 54
    if tools:
        card_w = 258
        card_h = 74
        gap = 10
        for idx, tool in enumerate(tools):
            cx = content_x + idx * (card_w + gap)
            box = (cx, current_y, cx + card_w, current_y + card_h)
            draw_tool_card(
                draw,
                box,
                tool["name"],
                tool["input"],
                tool["kind"],
                selected_tool == tool["id"],
            )
        current_y += card_h + 10
        if selected_tool:
            selected_kind = next((t["kind"] for t in tools if t["id"] == selected_tool), "other")
            panel_h = draw_result_panel(draw, content_x, current_y, content_w, selected_kind)
            current_y += panel_h + 8

    return current_y - y


def build_frame(t: float) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw_header(draw, t)
    draw_flow_heading(draw)

    steps = [
        {
            "time": "21:14:19",
            "model": "claude-3-7-sonnet",
            "tokens": "2782 tokens",
            "stop": "tool_use",
            "tools": [
                {"id": "web", "name": "WebSearch", "kind": "web", "input": "buscar historia de la cancion"},
                {"id": "bash", "name": "bash", "kind": "bash", "input": "rg -n nowhere notes"},
                {"id": "file", "name": "read_file", "kind": "file", "input": "README.md"},
            ],
        },
        {
            "time": "21:14:26",
            "model": "claude-3-7-sonnet",
            "tokens": "369 tokens",
            "stop": "tool_use",
            "tools": [
                {"id": "web2", "name": "fetch_webpage", "kind": "web", "input": "entrevista oficial"},
                {"id": "bash2", "name": "bash", "kind": "bash", "input": "cat excerpt.txt"},
            ],
        },
        {
            "time": "21:15:30",
            "model": "claude-3-7-sonnet",
            "tokens": "213 tokens",
            "stop": "end_turn",
            "tools": [],
        },
    ]

    progress = min(len(steps), t * (len(steps) + 0.6))
    y = 160
    for idx, step in enumerate(steps):
        stage_t = max(0.0, min(1.0, progress - idx))
        if idx == 0:
            selected = "web" if t < 0.5 else "bash"
        elif idx == 1 and t > 0.55:
            selected = "web2"
        else:
            selected = None
        h = draw_flow_step(draw, 84, y, W - 168, step, stage_t, idx < len(steps) - 1, selected)
        y += h + 20

    draw.text((68, H - 26), "README flow preview", font=F_TINY, fill=MUTED)
    return img


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [build_frame(i / (FRAMES - 1)) for i in range(FRAMES)]
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()