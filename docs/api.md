# API Documentation

## Interactive Docs

When running in development mode, a Swagger UI is available at:

```
http://localhost:3000/docs
```

This provides a browsable, interactive interface for all API endpoints.

## Authentication

The API uses a **dual-token authentication** scheme:

1. **Access token** — short-lived JWT (15 min), sent as `Authorization: Bearer <token>` header
2. **Refresh token** — long-lived (7 days), stored as an `httpOnly` cookie

### Login Flow

```
POST /api/auth/login
Body: { "username": "string", "password": "string" }

Response:
  - Access token in JSON body: { "user": {...}, "accessToken": "..." }
  - Refresh token in Set-Cookie header (httpOnly, path=/api/auth)
```

### Token Refresh

When an access token expires (401 response), the client automatically calls:

```
POST /api/auth/refresh
(No body — uses refreshToken cookie)

Response: { "user": {...}, "accessToken": "..." }
```

### Logout

```
POST /api/auth/logout
(Invalidates refresh token and clears cookie)
```

## Endpoint Summary

All endpoints require `Authorization: Bearer <token>` unless noted.

### Auth

| Method | Path                | Auth   | Description          |
| ------ | ------------------- | ------ | -------------------- |
| POST   | `/api/auth/login`   | No     | Login and get tokens |
| POST   | `/api/auth/refresh` | Cookie | Refresh access token |
| POST   | `/api/auth/logout`  | Cookie | Logout               |
| GET    | `/api/auth/me`      | Yes    | Get current user     |

### Users (admin-only except preferences/password)

| Method | Path                             | Auth      | Description           |
| ------ | -------------------------------- | --------- | --------------------- |
| GET    | `/api/users`                     | Admin     | List all users        |
| POST   | `/api/users`                     | Admin     | Create user           |
| GET    | `/api/users/:id`                 | Yes       | Get user by ID        |
| PATCH  | `/api/users/:id`                 | Admin     | Update user role/name |
| DELETE | `/api/users/:id`                 | Admin     | Delete user           |
| PATCH  | `/api/users/:id/preferences`     | Yes (own) | Update theme/homeView |
| POST   | `/api/users/:id/change-password` | Yes (own) | Change own password   |
| POST   | `/api/users/:id/reset-password`  | Admin     | Reset user password   |

### Dishes

| Method | Path                           | Auth  | Description                               |
| ------ | ------------------------------ | ----- | ----------------------------------------- |
| GET    | `/api/dishes`                  | Yes   | List dishes (`?archived=false&type=main`) |
| POST   | `/api/dishes`                  | Yes   | Create dish                               |
| GET    | `/api/dishes/:id`              | Yes   | Get dish                                  |
| PATCH  | `/api/dishes/:id`              | Yes   | Update dish                               |
| DELETE | `/api/dishes/:id`              | Admin | Hard delete dish                          |
| POST   | `/api/dishes/:id/archive`      | Yes   | Archive dish                              |
| POST   | `/api/dishes/:id/unarchive`    | Yes   | Unarchive dish                            |
| GET    | `/api/dishes/:id/preparations` | Yes   | Get dish preparation history              |
| GET    | `/api/dishes/:id/rating-stats` | Yes   | Get dish rating stats                     |
| GET    | `/api/dishes/:id/history`      | Yes   | Get dish preparation timeline             |

### Menus

| Method | Path                         | Auth | Description                                                |
| ------ | ---------------------------- | ---- | ---------------------------------------------------------- |
| GET    | `/api/menus/week/:date`      | Yes  | Get/create weekly menu (`date` = YYYY-MM-DD of week start) |
| GET    | `/api/menus/today`           | Yes  | Get today's dinner entry                                   |
| PATCH  | `/api/entries/:id`           | Yes  | Update dinner entry (type, dishes)                         |
| PATCH  | `/api/entries/:id/completed` | Yes  | Mark/unmark entry as completed                             |

### Preparations

| Method | Path                    | Auth | Description        |
| ------ | ----------------------- | ---- | ------------------ |
| POST   | `/api/preparations`     | Yes  | Log a preparation  |
| DELETE | `/api/preparations/:id` | Yes  | Delete preparation |

### Ratings

| Method | Path                            | Auth | Description                 |
| ------ | ------------------------------- | ---- | --------------------------- |
| GET    | `/api/preparations/:id/ratings` | Yes  | Get ratings for preparation |
| POST   | `/api/preparations/:id/ratings` | Yes  | Add rating                  |
| PATCH  | `/api/ratings/:id`              | Yes  | Update rating               |
| DELETE | `/api/ratings/:id`              | Yes  | Delete rating               |

### History

| Method | Path                    | Auth  | Description                                             |
| ------ | ----------------------- | ----- | ------------------------------------------------------- |
| GET    | `/api/history`          | Yes   | List history (`?startDate&endDate&search&limit&offset`) |
| DELETE | `/api/history/:entryId` | Admin | Delete history entry                                    |

### Settings

| Method | Path            | Auth  | Description                      |
| ------ | --------------- | ----- | -------------------------------- |
| GET    | `/api/settings` | Yes   | Get app settings                 |
| PATCH  | `/api/settings` | Admin | Update settings (`weekStartDay`) |

### Health

| Method | Path      | Auth | Description  |
| ------ | --------- | ---- | ------------ |
| GET    | `/health` | No   | Health check |

## Full Specification

See [specs/api.md](../specs/api.md) for complete request/response schemas and examples.
