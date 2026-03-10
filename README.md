## Manufac Product API

This is a small Product API built with **Express** and **Prisma**. It exposes CRUD routes for products and calculates a `final_price` on read operations using an external, flaky pricing check wrapped with **p-retry**.

### How to run (single command)

- **Prerequisites**: Docker and Docker Compose installed.
- **Start everything** (API + Postgres + migrations):

```bash
docker compose up --build
```

The API will be available at `http://localhost:3000`.

### Database & Prisma

- Database: PostgreSQL (via the `db` service in `docker-compose.yml`).
- Prisma schema and migrations live under `api/prisma`.
- When the `api` container starts, it runs:
  - `prisma generate`
  - `prisma migrate deploy`

so the database schema is applied automatically.

### Product model

Each product has:

- **id**: UUID (generated)
- **sku**: unique string
- **name**: string
- **baseCost**: number, ≥ 0, up to 2 decimals
- **currency**: 3 uppercase letters
- **tags**: array of strings
- **createdAt**: timestamp
- **updatedAt**: timestamp

`final_price` is **not stored** in the database. Whenever the API returns a single product (`POST`, `GET /products/:id`, `PATCH`), it calculates:

\[
final\_price = baseCost \times markup \times (1 + taxRate)
\]

where `markup` and `taxRate` come from the external pricing logic.

### Pricing, flakiness, and retry logic

The API uses `randomnumberapi.com` to simulate a flaky pricing service:

- It calls:

```text
http://www.randomnumberapi.com/api/v1.0/random?min=0&max=100&count=1
```

- The first (and only) element of the returned array is used as the random number `n`.
- There is an artificial delay of `100ms + (n % 400)` added to each call to simulate latency.

**Mapping random number → failure/success**

- If `n < 40`: treat this as a failure of the pricing system.
- If `n ≥ 40`: treat this as a success.
- On **success**, the pricing factors are:
  - `markup = 1.1`
  - `taxRate = 0.2`

**Retry behaviour (via `p-retry`)**

- The pricing call is wrapped in `p-retry`:
  - **Total tries**: 5 (1 initial + 4 retries).
  - **Timeout per attempt**: 1.5 seconds.
  - **Retry conditions**:
    - HTTP 429
    - HTTP 5xx
    - Timeouts or network errors (treated as retryable)
  - **Do not retry** on other 4xx errors (these abort retries).
  - **Backoff**:
    - Exponential: delays grow roughly like 200ms → 400ms → 800ms → ...
    - Jitter: `p-retry` randomizes delays to avoid synchronized retries.
    - Maximum delay capped at ~2 seconds.
- If all attempts fail, the pricing layer throws a `pricing_unavailable` error, and the API returns:
  - **502 Bad Gateway** with `{ "error": "pricing_unavailable", ... }`.

### Routes and behaviour

All routes are rooted at `/products`.

#### POST `/products`

- **What it does**: Create a new product and return it with `final_price`.
- **Validation (all fields required)**:
  - `sku`: 3–32 chars, letters/numbers/`_`/`-`.
  - `name`: 1–120 chars.
  - `baseCost`: number ≥ 0, max 2 decimal places.
  - `currency`: exactly 3 uppercase letters.
  - `tags`: array, 0–10 items, each 1–20 chars.
- **Responses**:
  - `201 Created` with product (including `final_price`) on success.
  - `400 Bad Request` with `error: "validation_error"` and details if validation fails.
  - `409 Conflict` with `error: "duplicate_sku"` if a product with the same SKU already exists.
  - `502 Bad Gateway` with `error: "pricing_unavailable"` if pricing fails after all retries.

Note: the API computes pricing **before** inserting into the database. If pricing repeatedly fails, the product is **not** created.

#### GET `/products/:id`

- **What it does**: Fetch a single product by `id` and return it with `final_price`.
- **Responses**:
  - `200 OK` with product including `final_price` on success.
  - `404 Not Found` if the product does not exist.
  - `502 Bad Gateway` with `error: "pricing_unavailable"` if pricing fails after all retries.

#### GET `/products?limit=&offset=&q=`

- **What it does**: List products with pagination and optional search.
- **Query params**:
  - `limit`: integer in `[1, 100]`, default `20`.
  - `offset`: integer ≥ 0, default `0`.
  - `q`: optional search string, 1–64 chars, applied to `name` and `sku` (case-insensitive).
- **Responses**:
  - `200 OK` with:
    - `total`
    - `limit`
    - `offset`
    - `items`: array of products **without** `final_price`.
  - `400 Bad Request` if any query param is invalid.

#### PATCH `/products/:id`

- **What it does**: Partially update a product and return it with `final_price`.
- **Validation**:
  - All fields (`sku`, `name`, `baseCost`, `currency`, `tags`) are **optional**.
  - At least **one** of these fields must be provided.
  - Each field, if present, must follow the same rules as in `POST /products`.
- **Responses**:
  - `200 OK` with the updated product including `final_price` on success.
  - `400 Bad Request` on validation error (including "no fields provided").
  - `404 Not Found` if the product does not exist.
  - `409 Conflict` if updating the SKU collides with an existing product.
  - `502 Bad Gateway` with `error: "pricing_unavailable"` if pricing fails after all retries.

The API computes pricing **before** performing the database update to avoid updating the record when it cannot provide a price.

#### DELETE `/products/:id`

- **What it does**: Delete a product.
- **Responses**:
  - `204 No Content` on successful deletion.
  - `404 Not Found` if the product does not exist.

### Input validation summary

- **POST `/products`**:
  - All fields required and validated as specified.
  - On error: `400` with `{ error: "validation_error", details: [...] }`.
- **PATCH `/products/:id`**:
  - Fields optional but at least one is required.
  - On error: `400` with the same error shape.
- **GET `/products`**:
  - `limit`, `offset`, `q` validated as described above.
  - On error: `400`.

### Example `curl` commands

Assuming the API is running at `http://localhost:3000`:

#### Create a product

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "SKU-123",
    "name": "Sample Product",
    "baseCost": 10.50,
    "currency": "USD",
    "tags": ["tag1", "tag2"]
  }'
```

#### Get a product by ID

```bash
curl -X GET http://localhost:3000/products/<PRODUCT_ID>
```

#### List products (default pagination)

```bash
curl -X GET "http://localhost:3000/products"
```

#### List products with pagination and search

```bash
curl -X GET "http://localhost:3000/products?limit=10&offset=0&q=sample"
```

#### Update a product

```bash
curl -X PATCH http://localhost:3000/products/<PRODUCT_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Product Name",
    "baseCost": 12.00
  }'
```

#### Delete a product

```bash
curl -X DELETE http://localhost:3000/products/<PRODUCT_ID>
```

### Trade-offs and notes

- **Tech stack**: The implementation uses plain JavaScript with Express and Prisma for simplicity; adding TypeScript would add compile-time safety but also extra tooling and build steps.
- **Validation**: Implemented manually instead of using a library like `zod` or `joi` to keep dependencies minimal and logic explicit.
- **Pricing behavior**:
  - The API prefers **correctness and resilience** over performance.
  - Pricing is recomputed on each single-product response (create, read-one, update), which is sufficient for this exercise but could be cached in a real system.
- **Migrations**: A single initial Prisma migration is included, matching the `Product` model. For more complex schema evolution, additional migrations would be added over time.

