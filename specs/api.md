# Dinner Planner - API Specification

## Overview

RESTful API using JSON. All endpoints (except auth) require authentication via JWT Bearer token.

**Base URL**: `/api/v1`

---

## Authentication

### POST `/auth/login`

Authenticate user and receive tokens.

**Request:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response: 200 OK**

```json
{
  "user": {
    "id": "string",
    "username": "string",
    "displayName": "string",
    "role": "admin" | "member"
  },
  "accessToken": "string",
  "expiresIn": 900
}
```

**Notes:**

- Refresh token set as httpOnly cookie
- Access token expires in 15 minutes

### POST `/auth/refresh`

Refresh access token using refresh token cookie.

**Response: 200 OK**

```json
{
  "accessToken": "string",
  "expiresIn": 900
}
```

### POST `/auth/logout`

Invalidate refresh token.

**Response: 204 No Content**

### POST `/auth/change-password`

Change current user's password.

**Request:**

```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response: 204 No Content**

---

## Users

### GET `/users`

List all users. _Admin only._

**Response: 200 OK**

```json
{
  "users": [
    {
      "id": "string",
      "username": "string",
      "displayName": "string",
      "role": "admin" | "member",
      "createdAt": "ISO8601"
    }
  ]
}
```

### POST `/users`

Create new user. _Admin only._

**Request:**

```json
{
  "username": "string",
  "displayName": "string",
  "password": "string",
  "role": "admin" | "member"
}
```

**Response: 201 Created**

```json
{
  "id": "string",
  "username": "string",
  "displayName": "string",
  "role": "admin" | "member",
  "createdAt": "ISO8601"
}
```

### GET `/users/:id`

Get user details.

**Response: 200 OK**

```json
{
  "id": "string",
  "username": "string",
  "displayName": "string",
  "role": "admin" | "member",
  "createdAt": "ISO8601"
}
```

### PATCH `/users/:id`

Update user. _Admin only, or self for limited fields._

**Request:**

```json
{
  "displayName": "string",
  "role": "admin" | "member"  // Admin only
}
```

**Response: 200 OK** (updated user object)

### DELETE `/users/:id`

Delete user. _Admin only. Cannot delete self._

**Response: 204 No Content**

### GET `/users/me`

Get current authenticated user.

**Response: 200 OK** (user object)

### PATCH `/users/me/preferences`

Update current user's preferences.

**Request:**

```json
{
  "theme": "light" | "dark",
  "homeView": "today" | "week" | "calendar"
}
```

**Response: 200 OK**

```json
{
  "theme": "light" | "dark",
  "homeView": "today" | "week" | "calendar"
}
```

---

## Dishes

### GET `/dishes`

List all dishes with optional filtering.

**Query Parameters:**

- `type`: `main` | `side` - filter by dish type
- `tag`: string - filter by tag (can repeat for multiple)
- `archived`: `true` | `false` - include archived (default: false)
- `search`: string - search name/description
- `sort`: `name` | `rating` | `recent` | `created` (default: name)
- `order`: `asc` | `desc` (default: asc)

**Response: 200 OK**

```json
{
  "dishes": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "type": "main" | "side",
      "tags": ["string"],
      "prepTime": number | null,
      "cookTime": number | null,
      "servings": number | null,
      "sourceUrl": "string" | null,
      "videoUrl": "string" | null,
      "archived": false,
      "aggregateRating": number | null,
      "preparationCount": number,
      "lastPreparedAt": "ISO8601" | null,
      "createdBy": {
        "id": "string",
        "displayName": "string"
      },
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

### POST `/dishes`

Create new dish.

**Request:**

```json
{
  "name": "string",
  "description": "string",
  "type": "main" | "side",
  "ingredients": [
    {
      "quantity": number | null,
      "unit": "string" | null,
      "name": "string",
      "notes": "string" | null
    }
  ],
  "instructions": "string",
  "prepTime": number | null,
  "cookTime": number | null,
  "servings": number | null,
  "sourceUrl": "string" | null,
  "videoUrl": "string" | null,
  "tags": ["string"]
}
```

**Response: 201 Created** (full dish object)

### GET `/dishes/:id`

Get dish with full details including ingredients.

**Response: 200 OK**

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "type": "main" | "side",
  "ingredients": [
    {
      "id": "string",
      "quantity": 2,
      "unit": "cups",
      "name": "flour",
      "notes": "sifted"
    }
  ],
  "instructions": "string (markdown supported)",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "sourceUrl": "https://...",
  "videoUrl": "https://...",
  "tags": ["italian", "pasta", "quick"],
  "archived": false,
  "aggregateRating": 4.2,
  "preparationCount": 12,
  "lastPreparedAt": "2024-01-15T18:30:00Z",
  "createdBy": {
    "id": "string",
    "displayName": "string"
  },
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### PATCH `/dishes/:id`

Update dish.

**Request:** (partial update, any fields from POST)

```json
{
  "name": "string",
  "ingredients": [...]
}
```

**Response: 200 OK** (updated dish object)

### DELETE `/dishes/:id`

Permanently delete dish. _Admin only._

**Response: 204 No Content**

### POST `/dishes/:id/archive`

Archive a dish.

**Response: 200 OK** (updated dish object with `archived: true`)

### POST `/dishes/:id/unarchive`

Restore an archived dish.

**Response: 200 OK** (updated dish object with `archived: false`)

### GET `/dishes/:id/preparations`

Get preparation history for a dish.

**Query Parameters:**

- `limit`: number (default: 20)
- `offset`: number (default: 0)

**Response: 200 OK**

```json
{
  "preparations": [...],
  "total": number
}
```

---

## Menus

### GET `/menus`

Get menus for a date range.

**Query Parameters:**

- `startDate`: ISO8601 date (required)
- `endDate`: ISO8601 date (required)

**Response: 200 OK**

```json
{
  "menus": [
    {
      "id": "string",
      "weekStartDate": "2024-01-14",
      "entries": [
        {
          "id": "string",
          "date": "2024-01-14",
          "type": "assembled",
          "customText": null,
          "mainDish": { "id": "...", "name": "..." },
          "sideDishes": [{ "id": "...", "name": "..." }],
          "completed": false,
          "preparation": null
        }
      ]
    }
  ]
}
```

### GET `/menus/week/:date`

Get menu for the week containing the given date.

**Response: 200 OK** (single menu object, created if doesn't exist)

### GET `/menus/today`

Get today's dinner entry.

**Response: 200 OK**

```json
{
  "entry": {
    "id": "string",
    "date": "2024-01-15",
    "type": "assembled",
    "mainDish": {...},
    "sideDishes": [...],
    "completed": false,
    "preparation": null
  },
  "menu": {
    "id": "string",
    "weekStartDate": "2024-01-14"
  }
}
```

---

## Dinner Entries

### GET `/entries/:id`

Get single dinner entry with full details.

**Response: 200 OK** (entry object with nested dish details)

### PATCH `/entries/:id`

Update a dinner entry.

**Request:**

```json
{
  "type": "assembled" | "fend_for_self" | "dining_out" | "custom",
  "customText": "string" | null,
  "mainDishId": "string" | null,
  "sideDishIds": ["string"] | null
}
```

**Response: 200 OK** (updated entry)

### POST `/entries/:id/complete`

Mark entry as completed (without logging preparation).

**Response: 200 OK** (updated entry with `completed: true`)

### POST `/entries/:id/uncomplete`

Mark entry as not completed.

**Response: 200 OK** (updated entry with `completed: false`)

---

## Preparations

### GET `/preparations`

List preparations with optional filtering.

**Query Parameters:**

- `dishId`: string - filter by dish
- `userId`: string - filter by preparer
- `startDate`: ISO8601
- `endDate`: ISO8601
- `limit`: number (default: 20)
- `offset`: number (default: 0)

**Response: 200 OK**

```json
{
  "preparations": [
    {
      "id": "string",
      "dish": { "id": "...", "name": "..." },
      "dinnerEntry": { "id": "...", "date": "..." },
      "preparedBy": { "id": "...", "displayName": "..." },
      "preparedDate": "ISO8601",
      "notes": "string" | null,
      "ratings": [
        {
          "id": "string",
          "user": { "id": "...", "displayName": "..." },
          "stars": 4,
          "note": "string" | null
        }
      ],
      "averageRating": 4.5,
      "createdAt": "ISO8601"
    }
  ],
  "total": number
}
```

### POST `/preparations`

Log a new preparation. _Auto-completes the dinner entry._

**Request:**

```json
{
  "dinnerEntryId": "string",
  "dishId": "string",
  "preparedById": "string",
  "notes": "string" | null
}
```

**Response: 201 Created** (preparation object)

### GET `/preparations/:id`

Get preparation details.

**Response: 200 OK** (preparation object with ratings)

### PATCH `/preparations/:id`

Update preparation notes.

**Request:**

```json
{
  "notes": "string"
}
```

**Response: 200 OK** (updated preparation)

### DELETE `/preparations/:id`

Delete a preparation.

**Response: 204 No Content**

---

## Ratings

### POST `/preparations/:id/ratings`

Add rating to a preparation.

**Request:**

```json
{
  "stars": 1-5,
  "note": "string" | null
}
```

**Response: 201 Created**

```json
{
  "id": "string",
  "preparationId": "string",
  "user": { "id": "...", "displayName": "..." },
  "stars": 4,
  "note": "Great tonight!",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### PATCH `/preparations/:preparationId/ratings/:ratingId`

Update own rating.

**Request:**

```json
{
  "stars": 5,
  "note": "Changed my mind, it was perfect!"
}
```

**Response: 200 OK** (updated rating)

### DELETE `/preparations/:preparationId/ratings/:ratingId`

Delete own rating.

**Response: 204 No Content**

---

## Tags

### GET `/tags`

List all tags with usage counts.

**Response: 200 OK**

```json
{
  "tags": [
    { "name": "italian", "count": 15 },
    { "name": "quick", "count": 23 },
    { "name": "vegetarian", "count": 8 }
  ]
}
```

---

## Settings

### GET `/settings`

Get app settings.

**Response: 200 OK**

```json
{
  "weekStartDay": 0 // 0=Sunday, 1=Monday, etc.
}
```

### PATCH `/settings`

Update app settings. _Admin only._

**Request:**

```json
{
  "weekStartDay": 1
}
```

**Response: 200 OK** (updated settings)

---

## Sync (Offline Support)

### GET `/sync/current-week`

Get all data needed for offline support of current week.

**Response: 200 OK**

```json
{
  "menu": { ... },
  "dishes": [ ... ],  // All dishes referenced in menu
  "syncedAt": "ISO8601"
}
```

### POST `/sync/changes`

Submit offline changes for sync.

**Request:**

```json
{
  "changes": [
    {
      "type": "preparation",
      "action": "create",
      "data": { ... },
      "clientId": "temp-uuid",
      "timestamp": "ISO8601"
    }
  ]
}
```

**Response: 200 OK**

```json
{
  "results": [
    {
      "clientId": "temp-uuid",
      "serverId": "actual-uuid",
      "status": "success" | "conflict" | "error",
      "error": "string" | null
    }
  ]
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { ... }  // Optional additional info
  }
}
```

### Error Codes

| Code               | HTTP Status | Description                         |
| ------------------ | ----------- | ----------------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid token            |
| `FORBIDDEN`        | 403         | Insufficient permissions            |
| `NOT_FOUND`        | 404         | Resource not found                  |
| `VALIDATION_ERROR` | 400         | Invalid request body                |
| `CONFLICT`         | 409         | Resource conflict (e.g., duplicate) |
| `INTERNAL_ERROR`   | 500         | Server error                        |

---

## Rate Limiting

Not implemented initially (single-household use), but headers reserved:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Versioning

API version in URL path (`/api/v1/`). Future breaking changes will use `/api/v2/`.
