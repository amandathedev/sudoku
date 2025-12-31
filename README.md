# Sudoku (simple, cute, modern)

This is a **dependency-free** Sudoku web app (just static files).

## Run it

- **Simplest**: open `index.html` in your browser.
- **Recommended** (avoids any browser file restrictions): run a tiny local server from this folder, e.g.

```bash
cd /Users/atreutler/dev/sudoku
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy (Netlify)

This project is already Netlify-ready (static publish directory is the repo root).

- Push this repo to GitHub.
- In Netlify, **New site from Git** → select the repo.
- Build settings:
  - **Build command**: *(empty)*
  - **Publish directory**: `.`

These settings are also encoded in `netlify.toml`.

## Features

- **Generator**: creates a solved grid, then removes numbers while keeping a **unique solution**
- **Difficulties**: easy / medium / hard
- **Controls**: click/tap, keypad, keyboard (arrows + 1–9 + backspace)
- **Quality**: conflict highlighting, check, hint, clear, solve
- **Autosave**: refresh-safe via `localStorage`
- **Theme**: light/dark toggle


