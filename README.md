# Samarth catalogue backend

Fill `.env` using the keys in `.env.example`, then run `npm start` (or `node index.js`). The server connects to MongoDB before listening. Cloudinary credentials are needed for image uploads. Use a separate Samarth database and an independent `ADMIN_JWT_SECRET`.

Samarth is a catalogue, not a shop: no prices are stored. Each product's "Buy now" and "Bulk purchase" buttons send visitors to nohar.in, where the sale happens.

## Conventions

- Admin requests require `Authorization: Bearer <token>`. Get the token from `POST /api/v1/admin/login` (below).
- Write endpoints accept JSON, or `multipart/form-data` when uploading images. In multipart requests, arrays and objects are sent as JSON strings.
- Images must be JPEG, PNG or WebP, at most 5 MB each.
- Responses include `success`, `message` and `data`; lists also include `pagination`.
- List queries support `page` (default 1) and `limit` (products default 20, categories default 50, maximum 100).

## Admin login — `/api/v1/admin`

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | Public | `{ email, password }` → `{ token, admin: { name, email } }` |
| GET | `/me` | Admin | Check a token and return the admin's name and email |

Credentials come from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. `ADMIN_PASSWORD` may be plain text or a bcrypt hash (`$2b$...`); a hash is recommended. The email match ignores case. Tokens are HS256 JWTs signed with `ADMIN_JWT_SECRET`, carry `role: "owner"`, and last 7 days. After 5 failed attempts, an IP address is locked out for 15 minutes; the counter is in memory and resets when the server restarts.

## Products — `/api/v1/products`

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/add` | Admin | Create a product |
| PUT | `/update/:id` | Admin | Update supplied fields |
| DELETE | `/delete/:id` | Admin | Delete a product and its uploaded images |
| GET | `/admin/get-all` | Admin | List all products, including inactive ones |
| GET | `/admin/get-by-id/:id` | Admin | Get any product, including inactive |
| GET | `/get-all` | Public | List active products |
| GET | `/featured` | Public | List active featured products |
| GET | `/most-buy` | Public | List active "most buy" products |
| GET | `/get-by-id/:id` | Public | Get an active product |
| GET | `/get-by-category/:categoryId` | Public | List active products in a category |

Fields (matching the admin "Add product" page):

| Field | Admin label | Rules |
| --- | --- | --- |
| `name` | Product name | Required on create |
| `description` | Description | Required on create |
| `categoryId` | Category | Required on create; must exist |
| `images` (files) | Product media | At least 1 on create, at most 10 |
| `inStock` | In stock / Out of stock | Boolean, default `true` |
| `isMostBuy` | Mark as most buy | Boolean, default `false` |
| `buyNowUrl` | Buy now link | Empty or a `https://nohar.in/...` link |
| `bulkPurchaseUrl` | Bulk purchase link | Empty or a `https://nohar.in/...` link |
| `isActive`, `isFeatured` | — | Booleans |
| `seo`, `socialShare`, `guideImage` | — | As before; Nohar's flat SEO field names are also accepted |

Unknown fields (including `price`) are ignored.

### Editing images

On update:

- Send `existingImages`: an array of the `public_id`s to keep, in display order. Images left out are deleted from Cloudinary after the product saves.
- Put `"__new__"` in that array where an uploaded file should go. This replaces one image in place, e.g. `["__new__", "samarth/products/images/a"]` with one file puts the new image first. Extra uploads not placed by a marker are appended.
- Uploading `images` without `existingImages` replaces the whole list. Sending neither leaves the images unchanged.
- The final list must have 1–10 images.

List queries also support `search` (name or description), `categoryId`, `isFeatured`, `isMostBuy` and `inStock`. Admin listing also supports `isActive`.

## Categories — `/api/v1/categories`

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/add` | Admin | Create a category |
| PUT | `/update/:id` | Admin | Update supplied fields |
| DELETE | `/delete/:id` | Admin | Delete an empty category and its thumbnail |
| GET | `/admin/get-all` | Admin | List all categories with total product counts |
| GET | `/admin/get-by-id/:id` | Admin | Get any category |
| GET | `/get-all` | Public | List active categories with active product counts |
| GET | `/get-by-id/:id` | Public | Get an active category |

Fields: `name` (required, unique ignoring case), `description`, `isActive` (the admin "Active / Draft" status), and an optional `thumbnail` file. Send `removeThumbnail=true` on update to remove it. Products require a category, so create categories before products. A category that still has products returns `409` on delete; move or delete its products first. Lists support `search` (name), and admin lists support `isActive`. Results are sorted by name and include `productCount`.

## Nohar referrals — `/api/v1/referrals`

A referral is one click on a product's "Buy now" or "Bulk purchase" button that sent a visitor to nohar.in. The sale happens on Nohar; its outcome is recorded here afterwards.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/track` | Public | `{ productId, type: "buy" \| "bulk", quantity? }` → records the click and returns `{ redirectUrl }` |
| GET | `/go/:productId?type=buy&quantity=10` | Public | Records the click and redirects (302) to Nohar. Works as a plain link without JavaScript |
| POST | `/admin/add` | Admin | Log a referral by hand: `productId`, `type`, `quantity`, `redirectedAt`, plus an optional outcome |
| PUT | `/update/:id` | Admin | Record the outcome: `status`, `orderValue`, `noharOrderId` |
| DELETE | `/delete/:id` | Admin | Delete a referral |
| GET | `/admin/get-all` | Admin | List referrals, newest first |
| GET | `/admin/summary?days=14` | Admin | Dashboard totals, outcome counts, daily series, top 5 products and stock counts |

- `redirectUrl` is the product's `buyNowUrl` or `bulkPurchaseUrl`, or `https://nohar.in` when that link is empty. Only active products can be tracked.
- `quantity` applies to bulk purchases only; buy-now clicks always record 1.
- `status` is `REDIRECTED` (awaiting update), `CONVERTED` or `NOT_CONVERTED`. `CONVERTED` requires a positive `orderValue`. Any other status clears the order value and the Nohar order ID.
- The list supports `type`, `status`, `productId` and `search` (product name or Nohar order ID).
- Daily figures use the Asia/Kolkata timezone.
- The public endpoints have no rate limit. Put them behind your host's or CDN's rate limiting before launch so the figures can't be inflated.

## Tests

Run `npm test` or `node --test`. Tests mock MongoDB and Cloudinary and do not connect to external services.
