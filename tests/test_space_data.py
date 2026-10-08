import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("space_data", Path(__file__).resolve().parents[1] / "scripts/refresh_space_data.py")
space_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(space_data)


class ApodTests(unittest.TestCase):
    def post(self, media):
        return {"link": "https://science.nasa.gov/image-article/test/", "content": {"rendered":
            '<div class="hds-media-detail-hero"><div class="media-detail-hero__media">' + media + '</div>'
            '<h1>Supernova &amp; stars</h1><table><tr class="media-detail-hero__meta-row"><th>Date</th><td>October 7, 2026</td></tr>'
            '<tr class="media-detail-hero__meta-row"><th>Credit &amp; License</th><td>Observatory</td></tr></table></div>'}}

    def test_actual_media_not_generic_social_image(self):
        result = space_data.parse_apod(self.post('<img src="https://assets.science.nasa.gov/image.jpg?w=3000&amp;h=3000" alt="Stars">'))
        self.assertEqual(result["title"], "Supernova & stars")
        self.assertEqual(result["date"], "2026-10-07")
        self.assertIn("w=960", result["image_url"])
        self.assertNotIn("h=3000", result["image_url"])
        self.assertEqual(result["credit"], "Observatory")

    def test_video_days_are_not_replaced_by_fake_images(self):
        result = space_data.parse_apod(self.post('<iframe src="https://www.youtube.com/embed/example"></iframe>'))
        self.assertIsNone(result["image_url"])
        self.assertIn("youtube", result["video_url"])

    def test_colon_labels_and_new_credit_field(self):
        post = self.post('<img src="https://assets.science.nasa.gov/saturn.png">')
        post["content"]["rendered"] = post["content"]["rendered"].replace(
            "<th>Date</th>", "<th>Date:</th>").replace("<th>Credit &amp; License</th>", "<th>Credit:</th>")
        result = space_data.parse_apod(post)
        self.assertEqual(result["date"], "2026-10-07")
        self.assertEqual(result["credit"], "Observatory")

    def test_post_date_is_a_fallback_not_the_current_day(self):
        post = self.post('<img src="https://assets.science.nasa.gov/saturn.png">')
        post["content"]["rendered"] = post["content"]["rendered"].replace(
            '<tr class="media-detail-hero__meta-row"><th>Date</th><td>October 7, 2026</td></tr>', "")
        post["date"] = "2026-10-06T00:05:00"
        self.assertEqual(space_data.parse_apod(post)["date"], "2026-10-06")
        del post["date"]
        with self.assertRaises(ValueError):
            space_data.parse_apod(post)

    def test_missing_or_untrusted_media_fails(self):
        with self.assertRaises(ValueError):
            space_data.parse_apod(self.post(''))
        with self.assertRaises(ValueError):
            space_data.parse_apod(self.post('<img src="https://example.com/fake.jpg">'))


if __name__ == "__main__":
    unittest.main()
