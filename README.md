# 🏇 Photo League Voter

Ranked-choice voting on photos for a Photo Music League, with a horse race for the results.

- **Website:** static files in `docs/`, hosted free on GitHub Pages.
- **Database + control panel:** a Google Sheet ([photo-league-votes](https://docs.google.com/spreadsheets/d/1TAeiqiLOfgefVv0jJlAKXDYAzPUfqXGIbqPJfkRZdgE/edit)) with a small Apps Script attached that the site talks to.
- **Photos:** pulled live from a public iCloud shared album, through the same Apps Script.
- **Login:** voters type their phone number; it has to match a row on the sheet's Voters tab.

## The sheet

| Tab | What goes there |
| --- | --- |
| **Settings** | League name, Rounds (how many photos to pick), Voting (`Not yet` / `Open` / `Closed`), Album link |
| **Voters** | Name and Phone for everyone invited. "Voted" fills in by itself. |
| **Ballots** | Written by the site. One row per voter: their ranked photo IDs. |

Phone numbers can be typed any way (`(555) 123-4567`, `+1 555 123 4567`...). Only the last 10 digits are compared.

Voting closes by itself once everyone on the Voters tab has voted. Then the results page runs the race. To close early, set Voting to `Closed`. To redo a vote, use **🏇 Photo League → Start over** in the sheet's menu.

## One-time setup

### 1. Hook the script up to the sheet
1. In the sheet: **Extensions → Apps Script**.
2. Delete what's in `Code.gs`, paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, approve the permissions prompt (Google warns because it's your own unverified script: **Advanced → Go to project**), and copy the **Web app URL** (ends in `/exec`).
5. Paste that URL into [`docs/config.js`](docs/config.js).

If you edit `Code.gs` later: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

The sheet itself can stay private (Share → General access: Restricted). The site never reads the sheet directly; it goes through the script, which runs as you. That keeps everyone's phone numbers out of public view.

### 2. Connect the photo album
1. In Photos, open the shared album → People icon → turn on **Public Website** → copy the link (`https://www.icloud.com/sharedalbum/#...`).
2. Paste it into **Album link** on the sheet's Settings tab.
3. In the sheet, run **🏇 Photo League → Keep album photos fresh (run once)** and approve the permissions.

Apple takes ~9 seconds to list an album, so the script keeps a cached copy (in Apps Script's built-in cache, not the sheet) and a timer refreshes it every 5 minutes. Visitors get the photo list and image links in one quick request, and boxes appear before the images finish loading. New photos added to the album show up within about 30 minutes; **Refresh album photos now** in the menu pulls them right away.

**Videos** in the album are on the ballot too: a still frame with the clip looping silently on top.

**GIFs:** Apple's public album link doesn't serve animated GIFs, so those are stored with the site in [`docs/gifs/`](docs/gifs/) as short looping videos (they play reliably on iPhones and are much smaller), each named by its Apple photo ID. The album still decides what's on the ballot. A GIF someone adds later stays off the ballot until it's added there; see [`docs/gifs/README.md`](docs/gifs/README.md).

### 3. Publish on GitHub Pages
1. Create a GitHub repo and push this project.
2. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch `main`, folder **`/docs`** → Save.
3. In a minute it's live at `https://<you>.github.io/<repo>/`. Send that link to the group.

Heads-up: anything in `docs/` is public. The photos aren't stored there; browsers load them straight from Apple.

### 4. Run a vote
1. Fill in Settings (league name, rounds) and Voters (name + phone).
2. Set Voting to **Open** and send people the link.
3. Watch the Voters tab fill in. When the last person votes, the race starts on everyone's results page.

## Try it locally first

```bash
npm run dev
```

Opens a local copy at http://localhost:8080 that runs the real `Code.gs` against a pretend sheet with four voters (phones `5550100001` through `5550100004`), using photos from the real iCloud album. Nothing touches your real Google Sheet. Peek at the pretend sheet at http://localhost:8080/dev-sheet.

Add `?live` to the address (http://localhost:8080/?live) to use the real sheet and deployed script instead, for example to check real-world speed.

## Publishing changes

Before committing a change to anything in `docs/`, run:

```bash
npm run stamp
```

It tags every script and stylesheet reference with a new version and writes `docs/version.json`; a page that notices it is an older cached copy reloads itself once. GitHub Pages lets browsers reuse files for 10 minutes, and without the stamp a visitor right after a publish can end up with a mix of old and new code.

## How ranked choice works here

We run instant-runoff once per round:

- Count everyone's top remaining choice. More than half wins.
- Otherwise the last-place photo is knocked out and those ballots move to their next choice. Repeat.
- The winner becomes **Round 1's photo**, is taken off every ballot, and the count runs again for Round 2, and so on.

Ties go to whoever did better in earlier counts, then to whoever was ranked higher overall, then to a fixed coin flip (the sheet's Tiebreak seed), so refreshing never changes the result. The results page shows every count.

```bash
npm test   # tests for the counting logic
```
