#!/usr/bin/env python
"""
stitch_tiles.py — Stitch downloaded map tiles into a single image or PDF.

Usage:
    python stitch_tiles.py --input output/1234567890 --zoom 15
    python stitch_tiles.py --input output/1234567890 --zoom 15 --format pdf
    python stitch_tiles.py --input output/1234567890 --zoom 15 --format png
    python stitch_tiles.py --input output/1234567890 --zoom 15 --format both

Options:
    --input     Path to the tile directory (e.g. output/1234567890)
    --zoom      Zoom level to stitch (must match downloaded zoom level)
    --format    Output format: png, pdf, or both (default: both)
    --out       Output filename without extension (default: stitched_map)
    --max-size  Max output image size in pixels per side (default: 16000)
                Larger areas will be downscaled to fit. Increase for printing.
    --dpi       DPI for PDF output (default: 150)

Examples:
    # Stitch zoom level 15 tiles from a download session
    python stitch_tiles.py --input output/1716000000000 --zoom 15

    # High-res PDF for A3 printing
    python stitch_tiles.py --input output/1716000000000 --zoom 15 --format pdf --dpi 300 --max-size 30000
"""

import os
import sys
import argparse
import glob
from PIL import Image

def find_tiles(input_dir, zoom):
    """Scan the directory for all tiles at a given zoom level."""
    pattern = os.path.join(input_dir, str(zoom), "*", "*.png")
    files = glob.glob(pattern)

    # Also try jpg
    if not files:
        pattern = os.path.join(input_dir, str(zoom), "*", "*.jpg")
        files = glob.glob(pattern)

    tiles = []
    for f in files:
        parts = f.replace("\\", "/").split("/")
        try:
            # Expect structure: .../zoom/x/y.ext
            z = int(parts[-3])
            x = int(parts[-2])
            y = int(os.path.splitext(parts[-1])[0])
            tiles.append((x, y, z, f))
        except (ValueError, IndexError):
            continue

    return tiles


def stitch(input_dir, zoom, max_size=16000, dpi=150, fmt="both", out_name="stitched_map"):
    print(f"\n🗺  Scanning tiles in: {input_dir}")
    print(f"   Zoom level: {zoom}")

    tiles = find_tiles(input_dir, zoom)

    if not tiles:
        print(f"\n❌  No tiles found at zoom {zoom} in {input_dir}")
        print(f"    Make sure the folder structure is: {input_dir}/{zoom}/x/y.png")
        sys.exit(1)

    print(f"   Found {len(tiles)} tiles")

    # Get bounds
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    cols = max_x - min_x + 1
    rows = max_y - min_y + 1

    print(f"   Grid: {cols} columns × {rows} rows")

    # Detect tile size from first tile
    sample_path = tiles[0][3]
    with Image.open(sample_path) as sample:
        tile_w, tile_h = sample.size

    print(f"   Tile size: {tile_w}×{tile_h}px")

    full_w = cols * tile_w
    full_h = rows * tile_h
    print(f"   Full image size: {full_w}×{full_h}px")

    # Downscale if needed
    scale = 1.0
    if full_w > max_size or full_h > max_size:
        scale = min(max_size / full_w, max_size / full_h)
        out_w = int(full_w * scale)
        out_h = int(full_h * scale)
        print(f"   Downscaling to {out_w}×{out_h}px (scale={scale:.3f}) to stay under --max-size {max_size}")
    else:
        out_w = full_w
        out_h = full_h

    # Build tile lookup
    tile_map = {(t[0], t[1]): t[3] for t in tiles}

    # Create canvas
    print(f"\n⏳  Stitching...")
    canvas = Image.new("RGB", (full_w, full_h), (200, 200, 200))

    missing = 0
    for i, x in enumerate(range(min_x, max_x + 1)):
        for j, y in enumerate(range(min_y, max_y + 1)):
            path = tile_map.get((x, y))
            if path:
                try:
                    with Image.open(path) as tile:
                        canvas.paste(tile.convert("RGB"), (i * tile_w, j * tile_h))
                except Exception as e:
                    missing += 1
            else:
                missing += 1

        # Progress
        pct = int((i + 1) / cols * 100)
        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
        print(f"\r   [{bar}] {pct}%  ({i+1}/{cols} columns)", end="", flush=True)

    print()

    if missing:
        print(f"   ⚠️  {missing} missing tiles replaced with grey")

    # Downscale if needed
    if scale < 1.0:
        print(f"   Resizing to {out_w}×{out_h}px...")
        canvas = canvas.resize((out_w, out_h), Image.LANCZOS)

    saved = []

    # Save PNG
    if fmt in ("png", "both"):
        png_path = out_name + ".png"
        print(f"\n💾  Saving PNG: {png_path}")
        canvas.save(png_path, "PNG", optimize=True)
        size_mb = os.path.getsize(png_path) / 1024 / 1024
        print(f"   ✅  Saved ({size_mb:.1f} MB)")
        saved.append(png_path)

    # Save PDF
    if fmt in ("pdf", "both"):
        pdf_path = out_name + ".pdf"
        print(f"\n📄  Saving PDF: {pdf_path}")

        # Calculate page size in points (1 inch = 72 points)
        page_w = out_w / dpi * 72
        page_h = out_h / dpi * 72

        canvas.save(
            pdf_path,
            "PDF",
            resolution=dpi,
            save_all=False,
        )
        size_mb = os.path.getsize(pdf_path) / 1024 / 1024
        print(f"   ✅  Saved ({size_mb:.1f} MB) at {dpi} DPI")
        print(f"   📐  Page size: {page_w/72:.1f}\" × {page_h/72:.1f}\" at {dpi} DPI")
        saved.append(pdf_path)

    print(f"\n🎉  Done! Output files:")
    for s in saved:
        print(f"   → {os.path.abspath(s)}")


def main():
    parser = argparse.ArgumentParser(
        description="Stitch map tiles into a single image or PDF.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--input",    required=True,  help="Path to tile directory (e.g. output/1716000000000)")
    parser.add_argument("--zoom",     required=True,  type=int, help="Zoom level to stitch")
    parser.add_argument("--format",   default="both", choices=["png", "pdf", "both"], help="Output format (default: both)")
    parser.add_argument("--out",      default="stitched_map", help="Output filename without extension (default: stitched_map)")
    parser.add_argument("--max-size", default=16000,  type=int, help="Max pixels per side before downscaling (default: 16000)")
    parser.add_argument("--dpi",      default=150,    type=int, help="DPI for PDF (default: 150)")

    args = parser.parse_args()

    stitch(
        input_dir=args.input,
        zoom=args.zoom,
        max_size=args.max_size,
        dpi=args.dpi,
        fmt=args.format,
        out_name=args.out,
    )


if __name__ == "__main__":
    main()
