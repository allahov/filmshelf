# FilmShelf PWA

Plain HTML/CSS/JS app prepared for GitHub + Vercel.

## Deploy to Vercel

1. Create a new GitHub repository.
2. Upload all files from this folder.
3. In Vercel, choose Add New Project.
4. Import the GitHub repository.
5. Framework preset: Other.
6. Build command: leave empty.
7. Output directory: leave empty or use `.`
8. Deploy.

## Install on phone

- iPhone: open the Vercel link in Safari, tap Share, then Add to Home Screen.
- Android: open the Vercel link in Chrome, tap menu, then Install app or Add to Home screen.

## Important

The app currently stores movies in localStorage. This means:
- data stays on the same device/browser;
- data does not sync between devices;
- data can be lost if browser storage is cleared.

For account login and cloud sync, add a database later.
