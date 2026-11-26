"""Expose actual Instagram photos through the existing public metadata lookup."""

from urllib.parse import urlsplit

from yt_dlp.extractor.instagram import InstagramIE as _InstagramIE


class _ZapstickInstagramIE(_InstagramIE, plugin_name="zapstick"):
    def _extract_product_media(self, product_media):
        result = super()._extract_product_media(product_media)
        # A video without playable formats must never become its cover image.
        if result.get("formats") or product_media.get("media_type") != 1:
            return result

        candidates = []
        for image in product_media.get("image_versions2", {}).get("candidates", []):
            address = image.get("url")
            if not isinstance(address, str):
                continue
            extension = urlsplit(address).path.rsplit(".", 1)[-1].lower()
            if extension in ("jpg", "jpeg", "png", "webp"):
                candidates.append((image, extension))
        if not candidates:
            return result

        image, extension = max(candidates, key=lambda item: (item[0].get("width") or 0) * (item[0].get("height") or 0))
        result["formats"] = [{
            "url": image["url"], "ext": "jpg" if extension == "jpeg" else extension,
            "format_id": "photo", "vcodec": "image", "acodec": "none",
            "width": image.get("width"), "height": image.get("height"),
        }]
        return result
