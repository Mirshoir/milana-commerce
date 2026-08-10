#!/usr/bin/env python3
"""Generate platform icons and launch logos from the approved brand artwork."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "brand" / "milana-premium-logo.jpg"
IOS_ICON_DIR = ROOT / "ios" / "Runner" / "Assets.xcassets" / "AppIcon.appiconset"
IOS_LAUNCH_DIR = ROOT / "ios" / "Runner" / "Assets.xcassets" / "LaunchImage.imageset"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"


def content_crop(source: Image.Image) -> Image.Image:
    """Trim JPEG whitespace without redrawing or recoloring the supplied logo."""
    image = source.convert("RGB")
    difference = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
    mask = ImageOps.grayscale(difference).point(lambda value: 255 if value > 8 else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"No visible artwork found in {SOURCE}")
    return image.crop(bounds)


def render_square(logo: Image.Image, size: int, content_fraction: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), "white")
    maximum = max(1, round(size * content_fraction))
    resized = logo.copy()
    resized.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    print(path.relative_to(ROOT))


def generate_ios_icons(logo: Image.Image) -> Image.Image:
    specification = json.loads((IOS_ICON_DIR / "Contents.json").read_text())
    generated: dict[str, int] = {}
    for entry in specification["images"]:
        filename = entry.get("filename")
        if not filename:
            continue
        points = float(entry["size"].split("x", 1)[0])
        scale = int(entry["scale"].removesuffix("x"))
        generated[filename] = round(points * scale)

    for filename, size in generated.items():
        save_png(render_square(logo, size, 0.84), IOS_ICON_DIR / filename)
    return render_square(logo, 1024, 0.84)


def generate_android_icons(logo: Image.Image) -> None:
    legacy_sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    foreground_sizes = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }
    for density, size in legacy_sizes.items():
        save_png(
            render_square(logo, size, 0.84),
            ANDROID_RES / f"mipmap-{density}" / "ic_launcher.png",
        )
    for density, size in foreground_sizes.items():
        save_png(
            render_square(logo, size, 0.62),
            ANDROID_RES / f"mipmap-{density}" / "ic_launcher_foreground.png",
        )


def generate_launch_logos(logo: Image.Image) -> None:
    ios_sizes = {
        "LaunchImage.png": 180,
        "LaunchImage@2x.png": 360,
        "LaunchImage@3x.png": 540,
    }
    for filename, size in ios_sizes.items():
        save_png(render_square(logo, size, 0.78), IOS_LAUNCH_DIR / filename)

    android_sizes = {
        "mdpi": 180,
        "hdpi": 270,
        "xhdpi": 360,
        "xxhdpi": 540,
        "xxxhdpi": 720,
    }
    for density, size in android_sizes.items():
        save_png(
            render_square(logo, size, 0.78),
            ANDROID_RES / f"drawable-{density}" / "splash_logo.png",
        )


def generate_web_icons(logo: Image.Image) -> None:
    web = ROOT / "web"
    for path, size, fraction in (
        (web / "favicon.png", 32, 0.9),
        (web / "icons" / "Icon-192.png", 192, 0.84),
        (web / "icons" / "Icon-512.png", 512, 0.84),
        (web / "icons" / "Icon-maskable-192.png", 192, 0.62),
        (web / "icons" / "Icon-maskable-512.png", 512, 0.62),
    ):
        save_png(render_square(logo, size, fraction), path)


def main() -> None:
    with Image.open(SOURCE) as source:
        logo = content_crop(source)
    master = generate_ios_icons(logo)
    generate_android_icons(logo)
    generate_launch_logos(logo)
    generate_web_icons(logo)
    play_icon = master.resize((512, 512), Image.Resampling.LANCZOS).convert("RGBA")
    save_png(
        play_icon,
        ROOT / "store" / "google-play" / "graphics" / "app-icon-512.png",
    )


if __name__ == "__main__":
    main()
