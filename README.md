# TaskNote

<!-- Logo: apps/web/src/assets/logo.png -->

**Local-first task management. Kanban + notes + file references — on your machine.**

TaskNote is a single-user task manager that runs entirely on your computer with a SQLite database — no account, no cloud sync, no subscription. Organize work on a drag-and-drop Kanban board, write freeform notes linked to tasks, and attach file references to keep everything in one place. Built with Vue 3 on the frontend and NestJS on the backend.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 20 |
| pnpm | >= 9 |

`better-sqlite3` compiles a native addon. You need C++ build tools for your platform:

- **macOS**: Xcode Command Line Tools — `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3` (Debian/Ubuntu) or equivalent
- **Windows**: Python 3 + Visual Studio Build Tools (select "Desktop development with C++")

---

## Quick Start

```bash
git clone https://github.com/your-org/tasknote.git
cd tasknote
pnpm install
pnpm dev
```

- Web app: http://localhost:5173
- API: http://localhost:3001

---

## Project Structure

```
tasknote/
├── apps/
│   ├── api/          # NestJS REST API (port 3001)
│   └── web/          # Vue 3 + Vite SPA (port 5173)
├── packages/
│   ├── shared/       # Zod schemas + TypeScript types shared by api and web
│   └── ui/           # Headless component library (Reka UI primitives)
└── tasks/            # PRD, specs, and ICT planning docs
```

---

## Scripts

Run any of these from the repo root. Turborepo fans them out to every workspace in the correct dependency order.

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start API + web in watch mode (parallel, persistent) |
| `pnpm build` | Compile all packages and apps for production |
| `pnpm test` | Run all Vitest suites |
| `pnpm typecheck` | Run TypeScript type-check across all workspaces |
| `pnpm lint` | Run ESLint across all workspaces |

---

## Database

TaskNote stores everything in a single SQLite file:

```
~/.tasknote/tasknote.sqlite
```

The directory is created automatically on first run. To use a different path, set the environment variable before starting:

```bash
TASKNOTE_DB_PATH=/path/to/custom.sqlite pnpm dev
```

---

## Keyboard Shortcuts

Shortcuts are blocked when a text input, textarea, or contenteditable element has focus. `Cmd/Ctrl+K` always fires regardless of focus.

| Shortcut | Action |
|----------|--------|
| `n` | Quick-add task in the focused column |
| `Cmd+K` / `Ctrl+K` | Open command palette (search) |
| `e` | Open drawer for the selected task |
| `Del` / `Backspace` | Archive the selected task |
| `1` – `9` | Jump to board by position |
| `g` then `n` | Go to Notes view |
| `g` then `b` | Go to Boards view |
| `?` | Open keyboard shortcut cheatsheet |

---

## Troubleshooting

**`better-sqlite3` fails to build during `pnpm install`**

Install the C++ build tools for your platform (see Requirements above), then rebuild:

```bash
pnpm rebuild better-sqlite3
```

**Port 3001 is already in use**

Find and stop the process occupying the port, or override the port before starting:

```bash
PORT=3002 pnpm dev
```

**Reset all app data**

Open the app, navigate to **Settings > Danger Zone > Reset**. Alternatively, delete the database file directly:

```bash
rm ~/.tasknote/tasknote.sqlite
```

The file is re-created with seed data on next startup.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Vue 3 | 3.5 |
| State management | Pinia | 2.2 |
| Routing | Vue Router | 4.4 |
| Component library | Reka UI | 2.0 |
| Styling | Tailwind CSS | 4.0 (beta) |
| Rich text editor | Milkdown | 7.0 |
| Animations | Anime.js | 4.0 |
| Backend framework | NestJS | 10.3 |
| Database | SQLite via better-sqlite3 | 9.4 |
| ORM | TypeORM | 0.3 |
| Monorepo orchestration | Turborepo | 2.0 |
| Package manager | pnpm | 9 |

---

## Run with Docker

Don't want to install the desktop app? Run TaskNote in a browser:

```bash
docker compose up -d
```

Open http://localhost:3001. Data persists in the `tasknote-data` volume.

---

## License

MIT
