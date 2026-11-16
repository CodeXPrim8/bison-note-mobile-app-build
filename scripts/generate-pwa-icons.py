"""Generate full-size home-screen icons that match native app tile scale."""

from pathlib import Path
from PIL import Image

app_src = Path(
    r"C:\Users\clemx\.cursor\projects\c-Users-clemx-OneDrive-Desktop-Bison-note-mobile-app-build\assets\Neon_Glossy__ucks_App_Icon-28f69e8b-e913-43cd-8a18-a757af7ca0a0.jpg"
)
fav_src = Path(
    r"C:\Users\clemx\.cursor\projects\c-Users-clemx-OneDrive-Desktop-Bison-note-mobile-app-build\assets\Glossy_Silver___App_Icon-81dd1285-6dde-4058-91aa-dcef9f693322.jpg"
)
root = Path(r"C:\Users\clemx\OneDrive\Desktop\Bison note mobile-app-build")
BG = (5, 8, 18, 255)


def square_rgba(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def zoom_cover(im: Image.Image, size: int, zoom: float) -> Image.Image:
    """
    Center-zoom then cover the square.
    Higher zoom = larger logo on the phone home screen.
    """
    w, h = im.size
    # Crop a centered window, then scale up to fill `size`.
    crop = max(8, int(min(w, h) / max(zoom, 1.01)))
    left = (w - crop) // 2
    top = (h - crop) // 2
    art = im.crop((left, top, left + crop, top + crop)).resize((size, size), Image.Resampling.LANCZOS)
    # Ensure opaque midnight under any transparency.
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.paste(art, (0, 0), art)
    return canvas


def save_png(im: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, format="PNG", optimize=True)
    print(f"wrote {dest} {im.size[0]}x{im.size[1]}")


app = square_rgba(app_src)
fav = square_rgba(fav_src)

# Push wordmark toward native app scale without clipping letters.
ANY_ZOOM = 1.38
MASK_ZOOM = 1.34
APPLE_ZOOM = 1.35
FAV_ZOOM = 1.45

for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    save_png(zoom_cover(app, size, ANY_ZOOM), root / "public" / name)

save_png(zoom_cover(app, 192, MASK_ZOOM), root / "public" / "icon-maskable-192.png")
save_png(zoom_cover(app, 512, MASK_ZOOM), root / "public" / "icon-maskable-512.png")
save_png(zoom_cover(app, 180, APPLE_ZOOM), root / "public" / "apple-icon.png")
save_png(zoom_cover(app, 512, ANY_ZOOM), root / "app" / "icon.png")
save_png(zoom_cover(app, 180, APPLE_ZOOM), root / "app" / "apple-icon.png")

for size, name in [
    (32, "favicon-32.png"),
    (48, "favicon-48.png"),
    (32, "icon-light-32x32.png"),
    (32, "icon-dark-32x32.png"),
    (192, "favicon-192.png"),
]:
    save_png(zoom_cover(fav, size, FAV_ZOOM), root / "public" / name)

ico_base = zoom_cover(fav, 128, FAV_ZOOM)
ico_sizes = [(16, 16), (32, 32), (48, 48)]
ico_imgs = [ico_base.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
ico_path = root / "public" / "favicon.ico"
ico_imgs[0].save(ico_path, format="ICO", sizes=ico_sizes, append_images=ico_imgs[1:])
print(f"wrote {ico_path}")
print("done")
