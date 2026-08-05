#!/usr/bin/env python3
"""Generate deterministic Google Play graphics from repository app assets.

Rights approval for the source artwork is tracked separately in
``store/assets/rights.json``. Generation does not imply that approval.
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "store" / "google-play" / "graphics"
ICON_SOURCE = (
    ROOT
    / "ios"
    / "Runner"
    / "Assets.xcassets"
    / "AppIcon.appiconset"
    / "Icon-App-1024x1024@1x.png"
)
HERO_SOURCE = ROOT / "assets" / "hero-poster.jpg"


def generate_icon() -> Path:
    destination = OUTPUT / "app-icon-512.png"
    with Image.open(ICON_SOURCE) as source:
        icon = source.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        icon.save(destination, format="PNG", optimize=True)
    return destination


def generate_feature_graphic() -> Path:
    destination = OUTPUT / "feature-graphic-1024x500.jpg"
    with Image.open(HERO_SOURCE) as source:
        canvas = ImageOps.fit(
            source.convert("RGB"),
            (1024, 500),
            method=Image.Resampling.LANCZOS,
            centering=(0.56, 0.48),
        )

    # Keep the canonical graphic text-free so the same rights-cleared artwork can
    # accompany every supported listing locale. A restrained burgundy wash and
    # edge vignette connect it to the application palette without adding claims.
    canvas = ImageEnhance.Color(canvas).enhance(0.9)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.04).convert("RGBA")
    wash = Image.new("RGBA", canvas.size, (111, 19, 49, 18))
    canvas = Image.alpha_composite(canvas, wash)

    vignette = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    pixels = vignette.load()
    for x in range(canvas.width):
        horizontal = abs((x / (canvas.width - 1)) - 0.5) * 2
        for y in range(canvas.height):
            vertical = abs((y / (canvas.height - 1)) - 0.5) * 2
            edge = max(horizontal, vertical)
            alpha = round(48 * (edge ** 2.4))
            pixels[x, y] = (24, 8, 15, alpha)
    canvas = Image.alpha_composite(canvas, vignette)

    canvas.convert("RGB").save(
        destination,
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
    )
    return destination


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    generated = [generate_icon(), generate_feature_graphic()]
    for path in generated:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
