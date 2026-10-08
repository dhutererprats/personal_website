import json
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ResearchPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.papers = {}
        self.paper = None
        self.heading = False
        self.details = []
        self.details_depth = 0
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article" and attrs.get("data-paper"):
            self.paper = {"title": "", "links": [], "figures": []}
            self.papers[attrs["data-paper"]] = self.paper
        if tag in {"h3", "h4"} and self.paper is not None:
            self.heading = True
        if tag == "a" and self.paper is not None:
            self.paper["links"].append(attrs.get("href"))
        if tag == "img" and self.paper is not None:
            attrs["in_disclosure"] = self.details_depth > 0
            self.paper["figures"].append(attrs)
        if tag == "details":
            self.details_depth += 1
            self.details.append(attrs)
        if tag == "script":
            self.scripts.append(attrs.get("src", ""))

    def handle_data(self, text):
        if self.heading and self.paper is not None:
            self.paper["title"] += text

    def handle_endtag(self, tag):
        if tag in {"h3", "h4"}:
            self.heading = False
        if tag == "article":
            self.paper = None
        if tag == "details":
            self.details_depth -= 1


class ResearchPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "research.html").read_text()
        cls.page = ResearchPage()
        cls.page.feed(cls.html)
        cls.registry = json.loads((ROOT / "data/research-papers.json").read_text())

    def test_paper_titles_and_figures_remain_attached_to_exact_sources(self):
        for record in self.registry["papers"]:
            if not record.get("result"):
                continue
            with self.subTest(paper=record["id"]):
                entry = self.page.papers[record["id"]]
                self.assertEqual(entry["title"], record["title"])
                self.assertIn(record["pdf_url"], entry["links"])
                self.assertIn("publications.html#" + record["id"], entry["links"])
                result = record["result"]
                self.assertIn(record["pdf_url"] + "#page=" + str(result["pdf_page"]), entry["links"])
                self.assertTrue(any(image.get("src") == result["preview"]
                                    and image.get("data-full-src") == result["full"]
                                    and image.get("width") and image.get("height")
                                    for image in entry["figures"]))

    def test_figures_use_native_disclosures_without_tab_script(self):
        self.assertEqual(len(self.page.details), 4)
        self.assertTrue(all("open" not in item for item in self.page.details))
        self.assertNotIn("research-results.js", self.page.scripts)
        self.assertNotIn('role="tablist"', self.html)

    def test_each_published_paper_has_its_own_visible_progressive_figure(self):
        for record in self.registry["papers"]:
            if not record.get("result"):
                continue
            with self.subTest(paper=record["id"]):
                previews = [image for image in self.page.papers[record["id"]]["figures"]
                            if not image["in_disclosure"]]
                self.assertEqual(len(previews), 1)
                self.assertEqual(previews[0]["src"], record["result"]["preview"])
                self.assertEqual(previews[0]["data-full-src"], record["result"]["full"])
                self.assertEqual(previews[0]["loading"], "lazy")

    def test_in_progress_visuals_are_labeled_as_related_work(self):
        self.assertEqual(self.html.count('class="submission-preview'), 2)
        self.assertIn("Related simulation · AMOS 2026", self.html)
        self.assertIn("Related imaging–downlink study · GN&amp;C 2026", self.html)

    def test_metric_headlines_and_generated_takeaway_template_are_removed(self):
        for rejected in ["Main takeaway", "What is new", "Outcome", "result-metric",
                         "79.82", "+5.55%", "22.82", "2.91 m/s"]:
            self.assertNotIn(rejected, self.html)
        self.assertIn("online target-priority promotions", self.html)
        self.assertIn("adapts a target-wise attention policy", self.html)
        self.assertIn("relative-motion model", self.html)

    def test_author_requested_in_progress_status_is_preserved(self):
        for paper_id in ["gnc-2027-catalog", "gnc-2027-communications"]:
            record = next(paper for paper in self.registry["papers"] if paper["id"] == paper_id)
            self.assertEqual(record["status"], "In progress")
            self.assertIsNone(record["pdf_url"])
            self.assertIn("publications.html#" + paper_id, self.html)
        self.assertEqual(self.html.count("In progress · GN&amp;C 2027"), 2)

    def test_about_me_label_and_bio_are_consistent(self):
        for path in ["index.html", "research.html", "publications.html", "about.html",
                     "files/AMOS_SBSS/Amos_sbss.html", "blog/robust-trajectory-rl.html"]:
            with self.subTest(path=path):
                text = (ROOT / path).read_text()
                self.assertNotIn(">About</a>", text)
                self.assertIn(">About Me</a>", text)
        for path in ["about.html", "about-globe.js"]:
            self.assertNotIn("project coordinator", (ROOT / path).read_text())


if __name__ == "__main__":
    unittest.main()
