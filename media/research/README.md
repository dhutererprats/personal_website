# Research presentation media

Web derivatives of the owner's AMOS presentation videos. The original MOV files
are unchanged and are not uploaded here. Paper/talk links and asset hashes live
in `data/research-papers.json`.

| Clip | Source size | Web size | Duration | Dimensions |
| --- | ---: | ---: | ---: | --- |
| AMOS 2026 catalog simulation | 248,989,862 B | 10,890,059 B | 47.73 s | 1920 x 1252 |
| AMOS 2025 Polaris visualization | 213,534,475 B | 19,694,245 B | 86.70 s | 1920 x 1384 |

Both retain the complete sequence, at 30 fps, in H.264/yuv420p MP4 with the index
at the front (`faststart`). The source clips have no audio. Metadata is stripped.
Use native controls, `playsinline`, `preload="none"`, and a lightweight JPEG
poster. Do not autoplay every research clip or replace these with GIFs.

Reproduce the encode with FFmpeg, substituting the source/output paths:

```sh
ffmpeg -i "$SOURCE" -vf 'scale=1920:-2:flags=lanczos,fps=30,setsar=1' \
  -c:v libx264 -preset slow -crf 25 -maxrate 1800k -bufsize 3600k \
  -pix_fmt yuv420p -an -map_metadata -1 -movflags +faststart "$OUTPUT"
```

The 2026 poster is at source time 8 s; the 2025 poster is at 60 s. Preview width
is 960 px. The two AMOS 2026 stage photos use resized JPEG previews and byte-for-
byte original-resolution copies linked by `data-full-src`.

The `.gitattributes` exception keeps only these web MP4s out of Git LFS so static
GitHub Pages serves video data, not a pointer. Older source videos retain their
existing LFS rules. The service worker bypasses movies and byte-range requests;
do not put whole movie files in its precache.
