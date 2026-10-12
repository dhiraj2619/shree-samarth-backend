# Samarth catalogue backend

Fill `.env` using the keys in `.env.example`, then run `npm start` (or `node index.js`). The server connects to MongoDB before listening. Cloudinary credentials are needed for image uploads. Use a separate Samarth database and an independent `ADMIN_JWT_SECRET`.

## Product API

Base path: `/api/v1/products`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/add` | Admin | Create a product |
| PUT | `/update/:id` | Admin | Update supplied fields |
| DELETE | `/delete/:id` | Admin | Delete a product and its uploaded images |
| GET | `/admin/get-all` | Admin | List all products, including inactive products |
| GET | `/get-all` | Public | List active products |
| GET | `/featured` | Public | List active featured products |
| GET | `/get-by-id/:id` | Public | Get an active product |
| GET | `/get-by-category/:categoryId` | Public | List active products in a category |
| GET | `/get-by-collection/:collectionId` | Public | List active products in a collection |

Admin requests require `Authorization: Bearer <token>` with an HS256 JWT signed using `ADMIN_JWT_SECRET` and containing `role: "owner"`, as in Nohar. An admin login/token issuance endpoint has not yet been implemented. Customer authentication is not used.

Create and update accept JSON for text fields, or `multipart/form-data` for uploads. Creating a product requires `name`, `description`, `categoryId`, and `collectionId`; referenced categories and collections must exist. Optional fields: `price`, `isActive`, `isFeatured`, `seo`, and `socialShare`. Price is for display only and may be omitted or zero.

Upload `images` (up to 10) and `guideImage` (up to 1). Files must use JPEG, PNG, or WebP MIME types and be at most 5 MB each. On update, uploaded `images` replace the image list; an uploaded `guideImage` replaces the guide image. Omitted image fields preserve existing images. Image URLs/public IDs from the request body are not used.

`seo` and `socialShare` accept objects in JSON requests or JSON strings in multipart requests. Nohar's flat SEO fields (`seoTitle`, `seoDescription`, `seoKeywords`, `seoCanonicalUrl`, `seoRobots`) and flat social sharing fields are also accepted. Updates preserve omitted nested fields.

List queries support `page` (default 1), `limit` (default 20, maximum 100), `search` (product name), `categoryId`, `collectionId`, and `isFeatured`. Admin listing also supports `isActive`. Responses include `success`, `message`, `data`, and list `pagination`.

Run `npm test` or `node --test` for controller and HTTP route tests. Tests mock MongoDB and Cloudinary and do not connect to external services.
