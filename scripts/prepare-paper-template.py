"""Render the approved PDF without changing its page geometry (requires PyMuPDF)."""
from pathlib import Path
import fitz
root = Path(__file__).resolve().parents[1]
with fitz.open(root / 'assets/templates/fangyuan-front-back.pdf') as document:
    for number, page in enumerate(document, 1):
        assert tuple(page.rect) == (0, 0, 1191, 842)
        target = root / f'src/static/paper/fangyuan-{number}.png'
        page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(target)
        print(target.name, target.stat().st_size)
