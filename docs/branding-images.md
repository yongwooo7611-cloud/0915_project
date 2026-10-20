# Community sharing assets

Generated with the built-in image generation tool using the imagegen skill.

## Final prompts

Favicon: Square production favicon for MOA at bodramdbo.shop. Two rounded human/leaf forms facing each other and forming a subtle heart in negative space. Forest green #315c46, sage #85a975, opaque ivory #fffefa. Large central bold simplified emblem legible at 32px. No letters or watermark.

Open Graph: Wide 1.91:1 social sharing cover for MOA. Warm ivory background, forest and sage green botanical leaves, two abstract human silhouettes forming a heart. Spacious editorial composition with exact text “모아”, “마음을 나누는 따뜻한 커뮤니티”, and “bodramdbo.shop”. Generous safe margins, no extra text or watermark.

## Published files

- `frontend/public/branding/favicon-32.png`: 32 × 32 PNG
- `frontend/public/branding/favicon-192.png`: 192 × 192 PNG
- `frontend/public/branding/apple-touch-icon.png`: 180 × 180 PNG
- `frontend/public/branding/moa-og-v1.jpg`: 1200 × 630 JPEG

The generated outputs were mechanically resized with `frontend/scripts/prepare-brand-assets.ps1`. The HTML head includes static Open Graph and Twitter tags so link crawlers can read them without executing React. All routes currently share the service cover. After changing a previously shared image, existing messenger previews may retain their cached version until the provider refreshes it.
