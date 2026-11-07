# GIFs hosted with the site

Apple's public shared-album link doesn't serve animated GIFs (it returns no
image at all for them), so the GIFs in the album are stored here instead.

- Each file is named by the photo's **Apple ID** (its `photoGuid` in the album),
  so the album is still the one list of what's on the ballot. These files only
  supply the picture.
- `index.json` lists them. A GIF in the album that isn't listed here is left
  off the ballot.

## Adding a new GIF that someone posts to the album

1. Download it from the album (Photos app or icloud.com).
2. Find its Apple ID: open `https://<site>/?live`, then in the browser
   console run
   `fetch(API + '?action=album').then(r => r.json()).then(a => a.photos.filter(p => !p.img))`
   (where `API` is the URL in `../config.js`). The ones with `img: false` are GIFs.
3. Save it here as `<APPLE ID>.gif`, add a line to `index.json`, commit, push.
