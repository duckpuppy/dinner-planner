# 🍽️ Dinner Planner

**Stop wasting mental energy deciding what to cook.** Dinner Planner helps busy families streamline meal planning and grocery shopping. Plan your week's dinners in advance, generate a grocery list automatically, and check it off as you shop. No more figuring out dinner after a long day of work.

## ✨ Key Features

- **Weekly Meal Planning** - Assign recipes to specific days with easy drag-and-drop interface
- **Recipe Library** - Store dishes with ingredients, instructions, nutrition info, and dietary tags (Low-Carb, Vegan, etc.)
- **Auto-Generated Grocery Lists** - Automatically combines ingredients from your planned meals into a shopping list
- **Check-Off as You Shop** - Check off items on your phone or tablet as you move through the store
- **Family Accounts** - Multiple family members can view and update meal plans together
- **Serving Size Scaling** - Ingredient quantities automatically adjust when you change serving sizes
- **Custom Grocery Items** - Add recurring household items (paper towels, milk, etc.) to your lists
- **Store Organization** - Tag ingredients by store to group shopping efficiently
- **PWA Support** - Works on mobile and desktop, installable as an app
- **Self-Hosted** - Complete data privacy—run it on your own server or local machine

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose (the easiest way to get started)
- Or: Node.js 22+ and pnpm 9+ (for development)

### Running with Docker (Recommended)

1. **Clone the repository**

   ```bash
   git clone https://github.com/duckpuppy/dinner-planner.git
   cd dinner-planner
   ```

2. **Create environment configuration**

   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and update these required variables:
   # - JWT_SECRET (generate with: openssl rand -base64 32)
   # - ADMIN_PASSWORD (your admin account password)
   ```

3. **Start the application**

   ```bash
   docker compose up -d
   ```

4. **Access the app**
   - Open <http://localhost:3000> in your browser
   - Log in with username `admin` and your configured password

5. **Complete setup wizard**
   - Set your family name
   - Configure dietary preferences (optional)
   - Start adding recipes!

### Running for Development

```bash
# Install dependencies
pnpm install

# Generate and run database migrations
pnpm db:generate
pnpm db:migrate

# Start development servers
pnpm dev
```

This starts:

- API server at <http://localhost:3000>
- Web app at <http://localhost:5173>

## 📸 Screenshots

_Screenshots would go here to show:_

- Week View - Plan your dinners for the week
- Recipe Detail - View ingredients, instructions, and nutrition
- Grocery List - Check off items as you shop
- Mobile PWA - Access anywhere on your phone

## ❓ FAQ

**How do I backup my data?**
Export to JSON from your account settings. This creates a full backup of all recipes, meal plans, and settings that you can download to your computer.

**Can I import recipes?**
Yes! Dinner Planner supports importing recipes from JSON and YAML files. Perfect for migrating from other meal planning apps.

**Does it work offline?**
Yes. The PWA (Progressive Web App) lets you view your current week's plan offline. Changes sync automatically when you reconnect to the internet.

**Can I scale serving sizes?**
Absolutely. When viewing a recipe or adding it to your meal plan, you can adjust the serving size and all ingredient quantities update automatically.

**Can I add custom grocery items?**
Yes. You can add recurring household items (like paper towels or milk) to your grocery lists independently of recipes.

**How do I share meal plans with my family?**
Family members can all log in with their own accounts and see the same weekly meal plan. Changes by any family member update for everyone.

**What devices does it work on?**
Dinner Planner works in any modern web browser on phones, tablets, and computers. You can install it as a PWA app on your home screen.

---

## 👨‍💻 For Developers

### Tech Stack

| Component      | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Frontend       | React 18, Vite, Tailwind CSS 3, TanStack Query v5, Zustand |
| Backend        | Fastify 5, TypeScript                                      |
| Database       | SQLite with Drizzle ORM                                    |
| Mobile         | Capacitor 8 (Android)                                      |
| Infrastructure | Docker, Docker Compose, GitHub Actions                     |

### Project Structure

```
dinner-planner/
├── apps/
│   ├── api/          # Fastify backend
│   │   ├── src/
│   │   │   ├── db/         # Database schema & migrations
│   │   │   ├── routes/     # API routes
│   │   │   ├── services/   # Business logic
│   │   │   └── middleware/ # Auth, validation, etc.
│   │   └── drizzle/        # Migration files
│   │
│   └── web/          # React frontend
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── hooks/
│           ├── lib/
│           └── stores/
│
├── packages/
│   └── shared/       # Shared types & validation schemas
│
├── specs/            # Project specifications
└── docs/             # Documentation
```

### Development Scripts

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `pnpm dev`           | Start all dev servers with hot reload |
| `pnpm build`         | Build all packages for production     |
| `pnpm type-check`    | Run TypeScript type checking          |
| `pnpm lint`          | Run ESLint to check code quality      |
| `pnpm format`        | Format code with Prettier             |
| `pnpm test`          | Run unit tests with Vitest            |
| `pnpm test:coverage` | Run tests with coverage report        |
| `pnpm db:generate`   | Generate database migrations          |
| `pnpm db:migrate`    | Run database migrations               |
| `pnpm db:studio`     | Open Drizzle Studio (database GUI)    |

### Database

```bash
# Generate a new migration based on schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Open Drizzle Studio to explore/edit database
pnpm db:studio
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm test:coverage

# Run tests for a single package
pnpm --filter @dinner-planner/api test
pnpm --filter @dinner-planner/web test

# Run tests in watch mode
pnpm test -- --watch
```

### Environment Variables

| Variable             | Description                                                      | Default                     |
| -------------------- | ---------------------------------------------------------------- | --------------------------- |
| `NODE_ENV`           | Environment mode (`development` or `production`)                 | `development`               |
| `PORT`               | API server port                                                  | `3000`                      |
| `HOST`               | API server host                                                  | `0.0.0.0`                   |
| `DATABASE_URL`       | SQLite database path                                             | `file:./data/dinner.db`     |
| `JWT_SECRET`         | Secret for JWT signing (generate with `openssl rand -base64 32`) | **(required)**              |
| `JWT_ACCESS_EXPIRY`  | Access token expiry duration                                     | `15m`                       |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry duration                                    | `7d`                        |
| `ADMIN_USERNAME`     | Initial admin account username                                   | `admin`                     |
| `ADMIN_PASSWORD`     | Initial admin account password                                   | **(required on first run)** |
| `CORS_ORIGIN`        | Allowed CORS origin for API requests                             | `http://localhost:5173`     |
| `TZ`                 | Timezone for scheduled tasks                                     | (optional)                  |

### Docker Development

Run with fast hot reload during development:

```bash
docker compose --profile dev up -d
```

This starts with:

- Volume mounts for live code updates
- Development-friendly environment variables
- Both port 3000 (API) and 5173 (frontend) exposed

Production build:

```bash
docker compose up -d
```

### Installation from Source

**Prerequisites:**

- Node.js 22+ and pnpm 9+
- Or: [mise](https://mise.jdx.dev/) (optional, manages versions automatically)

**Setup:**

```bash
# With mise (recommended)
mise install

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env and set JWT_SECRET and ADMIN_PASSWORD

# Initialize database
pnpm db:generate
pnpm db:migrate

# Start development
pnpm dev
```

### Deployment

See [Deployment Guide](docs/deployment.md) for:

- Docker setup and configuration
- Environment variables and secrets
- Data backup and restore
- Production deployment checklist

### API Documentation

Interactive API documentation is available at `/docs` during development (Swagger UI).

For full API reference, see [API Reference](docs/api.md) or [API Specification](specs/api.md).

### Project Specifications

Detailed documentation lives in the `specs/` directory:

- [requirements.md](specs/requirements.md) - Features, user stories, data model
- [architecture.md](specs/architecture.md) - Technical design and deployment options
- [api.md](specs/api.md) - Complete REST API specification
- [ui-flows.md](specs/ui-flows.md) - User interface flows and wireframes
- [milestones.md](specs/milestones.md) - Development roadmap and progress

## 📝 Contributing

Contributions are welcome! Please note this is a private project. When making changes:

1. Write tests for new features
2. Run `pnpm type-check` and `pnpm lint` before committing
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) format
4. Ensure test coverage remains above 80%

## ⚖️ License

Private project - All rights reserved
