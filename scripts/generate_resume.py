#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["Markdown==3.10.3", "playwright==1.62.0"]
# ///
"""Generate a versioned HTML/PDF resume pair from Markdown.

Install: python -m pip install Markdown==3.10.3 playwright==1.62.0
         python -m playwright install chromium
Run:     python scripts/generate_resume.py
         python scripts/generate_resume.py --version 2026-09 --browser msedge

The template and print styles live in this file. The original PDF is a layout
reference only; all generated resume content comes from the Markdown input.
"""

import argparse
from copy import deepcopy
from html import escape
import hashlib
from pathlib import Path
import re
import sys
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "Alexander Herlan Resume 2024.md"
CSS = """
@page { size: Letter; margin: 50pt 55.5pt 50pt 57.75pt; }
* { box-sizing: border-box; }
html { background: #e8e8e8; }
body {
  width: 612pt; margin: 24px auto; padding: 50pt 55.5pt 50pt 57.75pt;
  background: white; color: #111; font: 10pt/1.2 Lato, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
header { display: grid; grid-template-columns: 166.5pt 1fr; gap: 18pt;
  min-height: 124pt; break-inside: avoid; }
h1, h2, h3, h5, .contact-name { font-family: Raleway, Arial, sans-serif; }
h1 { font-size: 24pt; line-height: 1.16; margin: 0 0 5pt; }
.subtitle { font-size: 16pt; font-weight: bold; line-height: 1.2;
  color: #38761d; margin: 0; }
.subtitle > span { display: block; }
.gradient-word { white-space: nowrap; }
.contact { border-top: 3pt solid #000; padding-top: 9pt; }
.contact-name { font-size: 12pt; font-weight: bold; margin: 0 0 3pt; }
.contact p { margin: 0 0 7pt; }
.contact-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 9pt 10pt; margin-top: 10pt; }
.contact-grid a { grid-column: span 2; display: block; min-width: 0;
  border-left: 2pt solid #d6e7cb; padding-left: 7pt; font-size: 9pt;
  line-height: 1.3; }
.contact-grid a.direct { grid-column: span 3; }
.contact-label { display: block; color: #72796d; font-size: 7pt;
  letter-spacing: .8pt; text-transform: uppercase; margin-bottom: 2pt; }
.contact-value { display: inline-block; }
a { color: #38761d; text-decoration: none; overflow-wrap: anywhere; }
section { position: relative; margin: 0 0 18pt 184.5pt; }
.section-start { position: relative; border-top: 3pt solid #000;
  padding-top: 10pt; break-inside: avoid; break-after: avoid; }
h2 { position: absolute; top: -3pt; left: -184.5pt; width: 166.5pt;
  font-size: 12pt; line-height: 1.2; margin: 0; }
h2::before { content: ''; display: block; width: 12pt;
  border-top: 1.5pt solid #111; margin-bottom: 12pt; }
h3 { font-size: 12pt; line-height: 1.2; margin: 16pt 0 4pt; }
.section-start > h3 { margin-top: 0; }
h4 { color: #666; font-size: 10pt; margin: 8pt 0 4pt; }
h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; }
h3, h4, h5, h6 { break-after: avoid; }
p { margin: 0 0 6pt; orphans: 3; widows: 3; }
p.dates { color: #666; font-size: 9pt; text-transform: uppercase;
  margin-bottom: 8pt; break-after: avoid; }
p.dates em { font-style: normal; }
ul, ol { margin: 4pt 0 8pt; padding-left: 35pt; }
li { padding-left: 0; margin-bottom: 2pt; orphans: 2; widows: 2; }
li > p { margin-bottom: 2pt; }
.references { list-style: none; padding: 0; }
.references li { margin-bottom: 6pt; break-inside: avoid; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { text-align: left; vertical-align: top; padding: 4pt;
  border-bottom: 1px solid #ddd; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
img { max-width: 100%; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
@media print {
  html { background: white; }
  body { width: auto; margin: 0; padding: 0; }
}
"""


def serialize(element):
    return ET.tostring(element, encoding="unicode", method="html")


def gradient_text(text: str) -> str:
    """Use colored text runs so gradients print cleanly and remain selectable."""
    start, end = (40, 100, 20), (138, 191, 105)
    result = []
    offset = 0
    for word in re.split(r"(\s+)", text):
        if word.isspace():
            result.append(escape(word))
            offset += len(word)
            continue
        letters = []
        for character in word:
            fraction = offset / max(len(text) - 1, 1)
            color = "#" + "".join(f"{round(a + (b - a) * fraction):02x}" for a, b in zip(start, end))
            letters.append(f'<span style="color:{color}">{escape(character)}</span>')
            offset += 1
        result.append('<span class="gradient-word">' + "".join(letters) + '</span>')
    return "".join(result)


def build_html(source: str) -> str:
    """Keep Markdown order and inline formatting in the reference's two columns."""
    import markdown

    try:
        document = ET.fromstring(
            "<div>" + markdown.markdown(source, extensions=["extra"], output_format="xhtml") + "</div>"
        )
    except ET.ParseError as exc:
        raise ValueError("Markdown contains malformed raw HTML; use Markdown or valid XHTML.") from exc
    # Content edits belong in Markdown, never silently in a generated version.
    for node in document.iter():
        for attribute in ("text", "tail"):
            value = getattr(node, attribute)
            if value and ("\u2014" in value or "\u2013" in value):
                raise ValueError("Replace long dashes in the source Markdown before generating the resume.")
    nodes = list(document)
    if not nodes or nodes[0].tag != "h1":
        raise ValueError("Start the Markdown with a single # heading containing the name.")
    name_node = nodes.pop(0)
    name = "".join(name_node.itertext()).strip()
    if not name or any(node.tag == "h1" for node in nodes):
        raise ValueError("The resume must have exactly one nonempty # name heading.")
    intro = []
    while nodes and nodes[0].tag != "h2":
        intro.append(nodes.pop(0))
    if not nodes:
        raise ValueError("Add resume sections using ## headings.")

    subtitle = ""
    if intro and intro[0].tag == "p" and intro[0].find("strong") is not None:
        title = "".join(intro.pop(0).itertext())
        primary, separator, secondary = title.partition("·")
        subtitle = '<p class="subtitle"><span>' + gradient_text(primary.strip()) + '</span>'
        if separator:
            subtitle += '<span>' + gradient_text(secondary.strip()) + "</span>"
        subtitle += "</p>"
    contact_links = []
    for node in intro:
        for parent in node.iter():
            for child in list(parent):
                if child.tag != "a":
                    continue
                href = child.get("href", "")
                label = ("Phone" if href.startswith("tel:") else
                         "Email" if href.startswith("mailto:") else
                         "Profile" if "linkedin.com/" in href else
                         "Code" if "github.com/" in href else "Website")
                direct = ' class="direct"' if label in ("Phone", "Email") else ""
                contact_links.append(
                    f'<a href="{escape(href, quote=True)}"{direct}>'
                    f'<span class="contact-label">{label}</span>'
                    '<span class="contact-value">'
                    + gradient_text("".join(child.itertext())) + '</span></a>'
                )
                tail = (child.tail or "").strip(" ·|\n\t")
                if tail:
                    position = list(parent).index(child)
                    if position:
                        previous = parent[position - 1]
                        previous.tail = (previous.tail or "") + tail
                    else:
                        parent.text = (parent.text or "") + tail
                parent.remove(child)
        for br in list(node):
            if br.tag == "br" and not (br.tail or "").strip():
                node.remove(br)
    contact_details = "".join(serialize(node) for node in intro if "".join(node.itertext()).strip())
    contact_grid = '<nav class="contact-grid" aria-label="Contact and social links">' + "".join(contact_links) + '</nav>' if contact_links else ""
    header = (
        "<header><div>" + serialize(name_node) + subtitle + '</div><div class="contact">'
        + '<p class="contact-name">' + escape(name) + "</p>"
        + contact_details + contact_grid + "</div></header>"
    )

    sections = []
    for node in nodes:
        if node.tag == "h2":
            sections.append((node, []))
        else:
            sections[-1][1].append(node)
    rendered = []
    for heading, content in sections:
        if not content:
            raise ValueError(f"Section {''.join(heading.itertext())!r} has no content.")
        for node in content:
            # Dates follow role/project headings in the source Markdown.
            if node.tag == "p" and len(node) == 1 and node[0].tag == "em" and not (node.text or "").strip() and not (node[0].tail or "").strip():
                node.set("class", "dates")
        # The reference lists each contact on its own line, rather than a grid.
        if "".join(heading.itertext()).strip().lower() == "references":
            for index, node in enumerate(content):
                if node.tag != "table":
                    continue
                rows = node.findall("./tbody/tr")
                if not rows or any(len(row) != 4 for row in rows):
                    continue
                listing = ET.Element("ul", {"class": "references"})
                for row in rows:
                    item = ET.SubElement(listing, "li")
                    for column, cell in enumerate(row):
                        span = ET.SubElement(item, "strong" if column == 0 else "span")
                        span.text = cell.text
                        span.extend(deepcopy(list(cell)))
                        span.tail = " · " if column < 2 else (": " if column == 2 else "")
                content[index] = listing
        # Keep the label with the first content block when a section crosses pages.
        start = '<div class="section-start">' + serialize(heading) + serialize(content[0]) + "</div>"
        rendered.append("<section>" + start + "".join(serialize(node) for node in content[1:]) + "</section>")
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<meta name="source-sha256" content="{hashlib.sha256(source.encode("utf-8")).hexdigest()}">'
        f"<title>{escape(name)} | Resume</title><style>{CSS}</style></head>"
        + "<body>" + header + "<main>" + "".join(rendered) + "</main></body></html>\n"
    )


def generate(source: Path, output: Path, version: str | None, browser: str):
    from playwright.sync_api import sync_playwright

    html = build_html(source.read_text(encoding="utf-8-sig"))
    output.mkdir(parents=True, exist_ok=True)
    if version is None:
        number = 1
        while any((output / f"resume-v{number}.{ext}").exists() for ext in ("html", "pdf")):
            number += 1
        version = f"v{number}"
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", version):
        raise ValueError("Version must be 1–80 letters, digits, dots, underscores or hyphens, starting with a letter or digit.")
    targets = [output / f"resume-{version}.{ext}" for ext in ("html", "pdf")]
    if any(path.exists() for path in targets):
        raise ValueError(f"Version {version!r} already exists. Choose a new version.")

    with tempfile.TemporaryDirectory(prefix="resume-") as temporary:
        html_path = Path(temporary) / targets[0].name
        pdf_path = Path(temporary) / targets[1].name
        html_path.write_text(html, encoding="utf-8")
        with sync_playwright() as playwright:
            options = {} if browser == "chromium" else {"channel": browser}
            chromium = playwright.chromium.launch(headless=True, **options)
            try:
                page = chromium.new_page(java_script_enabled=False)
                page.goto(html_path.as_uri(), wait_until="load")
                page.pdf(path=str(pdf_path), print_background=True, prefer_css_page_size=True,
                         display_header_footer=False, tagged=True, outline=True)
            finally:
                chromium.close()
        # Publish only a complete pair, and never overwrite an earlier version.
        created = []
        try:
            for target, staged in zip(targets, (html_path, pdf_path)):
                with target.open("xb") as handle:
                    created.append(target)
                    handle.write(staged.read_bytes())
        except Exception:
            for target in created:
                target.unlink(missing_ok=True)
            raise
    return targets


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE, help="UTF-8 Markdown input")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "resumes")
    parser.add_argument("--version", help="Version label; defaults to the next available v1, v2, ...")
    parser.add_argument("--browser", choices=["chromium", "msedge", "chrome"], default="chromium")
    args = parser.parse_args()
    try:
        paths = generate(args.source.resolve(), args.output_dir.resolve(), args.version, args.browser)
    except ImportError as exc:
        parser.exit(1, f"Missing dependency: {exc}. Install Markdown==3.10.3 and playwright==1.62.0.\n")
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Resume generation failed: {exc}\n")
    except Exception as exc:
        parser.exit(1, f"PDF rendering failed: {exc}\nInstall Chromium with: {sys.executable} -m playwright install chromium\nOr select an installed browser with --browser msedge or --browser chrome.\n")
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
