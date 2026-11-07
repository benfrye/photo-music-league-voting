# GIFs hosted with the site

Apple's public shared-album link doesn't serve animated GIFs (it returns no
image at all for them), so the album's GIFs are stored here instead, as
silent looping videos. Videos play reliably on iPhones (which can be set not
to animate GIFs) and are about a fifth of the size.

- Files are named by the photo's **Apple ID** (its `photoGuid` in the album),
  so the album is still the one list of what's on the ballot. These files only
  supply the picture: `<ID>.mp4` (the loop) and `<ID>.jpg` (a still frame for
  thumbnails, the race, and phones that block autoplay).
- `index.json` lists them. A GIF in the album that isn't listed here is left
  off the ballot.

## Adding a new GIF that someone posts to the album

1. Download it from the album (Photos app or icloud.com).
2. Find its Apple ID: open the site, then in the browser console run
   `fetch(API + '?action=album').then(r => r.json()).then(a => a.photos.filter(p => !p.img))`
   (where `API` is the URL in `../config.js`). The ones with `img: false` are GIFs.
3. Convert it (needs ffmpeg):

   ```bash
   ffmpeg -i in.gif -movflags +faststart -pix_fmt yuv420p \
     -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 22 -an <ID>.mp4
   ffmpeg -i in.gif -frames:v 1 -q:v 3 <ID>.jpg
   ```

4. Add `"<ID>": { "poster": "gifs/<ID>.jpg", "video": "gifs/<ID>.mp4" }` to
   `index.json`, then `npm run stamp`, commit, push.
