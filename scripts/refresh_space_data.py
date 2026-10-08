#!/usr/bin/env python3
"""Refresh dated fallback data without API keys or third-party Python packages."""
import argparse
import json
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

ORBITS = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json"
NASA = "https://science.nasa.gov/wp-json/wp/v2/image-article?categories=22766&per_page=1&_fields=title,content,link,date"


class ApodHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.title = []
        self.metadata = {}
        self.key = []
        self.value = []
        self.image = None
        self.video = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "media-detail-hero__meta-row" in attrs.get("class", "").split():
            self.key, self.value = [], []
        hero = any("media-detail-hero__media" in a.get("class", "").split() for _, a in self.stack)
        if hero and tag == "img":
            self.image = attrs
        if hero and tag in ("iframe", "video"):
            self.video = attrs
        if tag not in ("img", "br", "hr", "input", "source", "meta", "link", "wbr"):
            self.stack.append((tag, attrs))

    def handle_data(self, data):
        tags = [tag for tag, _ in self.stack]
        if any(tag in ("h1", "h2") for tag in tags) and any("hds-media-detail-hero" in a.get("class", "").split() for _, a in self.stack):
            self.title.append(data)
        if any("media-detail-hero__meta-row" in a.get("class", "").split() for _, a in self.stack):
            if "th" in tags:
                self.key.append(data)
            if "td" in tags:
                self.value.append(data)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                closing = self.stack[i:]
                if any("media-detail-hero__meta-row" in a.get("class", "").split() for _, a in closing):
                    key = " ".join("".join(self.key).split()).rstrip(":").strip()
                    self.metadata[key] = " ".join("".join(self.value).split())
                del self.stack[i:]
                break


def nasa_url(value):
    parsed = urlparse(value or "")
    if parsed.scheme != "https" or not (parsed.hostname == "nasa.gov" or (parsed.hostname or "").endswith(".nasa.gov")):
        raise ValueError("Unexpected NASA media/entry URL")
    return value


def parse_apod(post):
    page = ApodHTML()
    page.feed(post["content"]["rendered"])
    title = " ".join("".join(page.title).split())
    try:
        date = (datetime.strptime(page.metadata["Date"], "%B %d, %Y")
                if page.metadata.get("Date") else datetime.fromisoformat(post["date"])).date().isoformat()
    except (KeyError, ValueError) as error:
        raise ValueError("Missing or invalid APOD date") from error
    image = nasa_url(page.image["src"]) if page.image else None
    if not title or not (image or page.video):
        raise ValueError("Missing APOD title or media")
    preview = image
    if image and urlparse(image).hostname == "assets.science.nasa.gov":
        parts = urlparse(image)
        query = parse_qs(parts.query)
        query["w"], query["fit"] = ["960"], ["clip"]
        query.pop("h", None)
        preview = urlunparse(parts._replace(query=urlencode(query, doseq=True)))
    return {"title": title, "date": date, "url": nasa_url(post["link"]),
            "image_url": preview, "full_url": image,
            "video_url": page.video.get("src") if page.video else None,
            "alt": page.image.get("alt", title) if page.image else title,
            "credit": page.metadata.get("Credit & License") or page.metadata.get("Credit") or "NASA Astronomy Picture of the Day"}


def get_json(url):
    with urlopen(Request(url, headers={"User-Agent": "PersonalWebsiteDataRefresh/1.0"}), timeout=20) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    catalog = get_json(ORBITS)
    stations = [next(record for record in catalog if int(record["NORAD_CAT_ID"]) == identifier) for identifier in (25544, 48274)]
    for record in stations:
        epoch = datetime.fromisoformat(record["EPOCH"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        if not -86400 <= (now - epoch).total_seconds() <= 3 * 86400:
            raise ValueError("Refusing stale orbital data")
    apod = parse_apod(get_json(NASA)[0])
    stamp = now.isoformat()
    apod["fetched_at"] = stamp
    args.output.mkdir(parents=True, exist_ok=True)
    for name, value in (("stations.json", {"fetched_at": stamp, "source": ORBITS, "elements": stations}), ("apod.json", apod)):
        (args.output / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    print(f"Refreshed both stations and APOD {apod['date']}: {apod['title']}")


if __name__ == "__main__":
    main()
