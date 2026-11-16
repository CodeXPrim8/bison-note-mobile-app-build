from pathlib import Path
from PIL import Image

app_src = Path(
    r"C:\Users\clemx\.cursor\projects\c-Users-clemx-OneDrive-Desktop-Bison-note-mobile-app-build\assets\Neon_Glossy__ucks_App_Icon-28f69e8b-e913-43cd-8a18-a757af7ca0a0.jpg"
)
fav_src = Path(
    r"C:\Users\clemx\.cursor\projects\c-Users-clemx-OneDrive-Desktop-Bison-note-mobile-app-build\assets\Glossy_Silver___App_Icon-81dd1285-6dde-4058-91aa-dcef9f693322.jpg"
)
root = Path(r"C:\Users\clemx\OneDrive\Desktop\Bison note mobile-app-build")


def square_rgba(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def save_png(im: Image.Image, dest: Path, size: int) -> None:
    out = im.resize((size, size), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, format="PNG", optimize=True)
    print(f"wrote {dest} {size}x{size}")


app = square_rgba(app_src)
fav = square_rgba(fav_src)

# App icon (image 1)
save_png(app, root / "public" / "icon-192.png", 192)
save_png(app, root / "public" / "icon-512.png", 512)
save_png(app, root / "public" / "apple-icon.png", 180)
save_png(app, root / "app" / "icon.png", 512)
save_png(app, root / "app" / "apple-icon.png", 180)

# Favicon (image 2)
save_png(fav, root / "public" / "favicon-32.png", 32)
save_png(fav, root / "public" / "favicon-48.png", 48)
save_png(fav, root / "public" / "icon-light-32x32.png", 32)
save_png(fav, root / "public" / "icon-dark-32x32.png", 32)
save_png(fav, root / "public" / "favicon-192.png", 192)

ico_sizes = [(16, 16), (32, 32), (48, 48)]
ico_imgs = [fav.resize(size, Image.Resampling.LANCZOS) for size in ico_sizes]
ico_path = root / "public" / "favicon.ico"
ico_imgs[0].save(ico_path, format="ICO", sizes=ico_sizes, append_images=ico_imgs[1:])
print(f"wrote {ico_path}")

fav.save(root / "public" / "favicon-source.png", format="PNG", optimize=True)
print("done")
