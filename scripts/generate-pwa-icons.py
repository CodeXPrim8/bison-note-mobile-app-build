"""Generate home-screen / PWA icons. Never writes favicon files."""

from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
app_src = Path(
    r"C:\Users\clemx\.cursor\projects\c-Users-clemx-OneDrive-Desktop-Bison-note-mobile-app-build\assets\Neon_Glossy__ucks_App_Icon-794108e7-24ec-4e9e-9c65-0640c2d09496.jpg"
)


def square_rgba(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def resize_square(im: Image.Image, size: int) -> Image.Image:
    """Full tile — keep the designed rounded neon icon, no zoom crop."""
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, format="PNG", optimize=True)
    print(f"wrote {dest} {im.size[0]}x{im.size[1]}")


app = square_rgba(app_src)

for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    save_png(resize_square(app, size), root / "public" / name)

save_png(resize_square(app, 192), root / "public" / "icon-maskable-192.png")
save_png(resize_square(app, 512), root / "public" / "icon-maskable-512.png")
save_png(resize_square(app, 180), root / "public" / "apple-icon.png")
save_png(resize_square(app, 512), root / "app" / "icon.png")
save_png(resize_square(app, 180), root / "app" / "apple-icon.png")
print("done (favicon files untouched)")
