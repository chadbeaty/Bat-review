# Track B: selling

The seller side of Phase 2: the `/sell` page, the 10-step listing flow with photo uploads, the seller dashboard, profile settings and catalog requests.

## Pages

| Path | What |
| --- | --- |
| `/sell` | Public. How selling works, the commission from `fee_configuration` with a worked $200 example, which photos to take of a bat, packing tips, and a "Start a listing" button (sign-in first). |
| `/sell/new` | The listing flow (signed in). `?listing=<id>&step=<step>` resumes a draft on a given step. |
| `/seller` | Dashboard: counts of drafts, live and reserved/sold listings, plus links. |
| `/seller/listings` | Tabs: drafts, live, reserved and sold, removed and expired. Resume, edit, remove (live) and delete (drafts only). |
| `/seller/listings/[id]/edit` | The same flow for an existing listing. Reserved and sold listings are shown read-only. |
| `/account/profile` | Username (unique regardless of case), display name, bio, city, state, private ZIP and profile photo. |
| `/account/catalog-requests` | The member's catalog requests and their status. |

`/account` now links to the profile settings, the seller dashboard and the catalog requests.

## How the listing flow works

The flow is one Client Component (`src/components/sell/ListingWizard.tsx`, steps in `steps.tsx`) driven by Server Actions in `src/app/sell/actions.ts`.

1. **Category, 2. brand, 3. model.** The model step lists published catalog products for that category and brand, with a search box. "My model isn't listed" files a `product_submissions` row (with `details.listing_id`) and the listing continues without a `product_id`. Saving step 3 creates the `equipment_listings` row as a `draft`. The city and state are copied from the seller's profile, the profile ZIP becomes the default ship-from ZIP, and catalog values prefill the attributes.
4. **Details.** The form is generated from the category's `attribute_schema` (`src/lib/sell/attributes.ts`): numbers with options become selects, multiselects become checkboxes. Values known from `bat_specifications` and `product_specifications` are prefilled and marked "From the catalog. Confirm it matches." There's also the cosmetic condition (1–10, labels from `src/lib/format.ts`), a title suggested from year, brand, model, stamps and weight (it follows the fields until the seller types their own), and a description.
5. **Photos.** The browser resizes each photo with a canvas (long edge 2,000 px, JPEG) and uploads it straight to the `listing-images` bucket at `<user id>/<listing id>/<random>.jpg` with the seller's session. Files the browser can't decode (HEIC outside Safari) are uploaded as they are. The server action then checks the path, and the stored object's type and size through the service role, and deletes anything that fails. Then it saves the `listing_images` row. The category's `required_photos` checklist ticks off as photos are tagged. Photos can be retagged, reordered (the first is the cover) and removed. Up to 12.
6. **Price.** Live preview of the commission and "you receive before payment processing", using `sellerProceedsBeforeProcessing` with the rule from `getCurrentFee`. The pricing hint lists verified `price_history` sales for the model, or says "No verified sales for this model yet."
7. **Shipping.** Package size and weight in inches and pounds (stored in ounces). "Use standard bat box" fills in 36 × 5 × 5 in at 3 lb, labeled as a starting point. The ship-from ZIP must be 5 digits. It's read back with `get_listing_shipping_origin`.
8. **Disclosures.** Each damage question needs a yes or no. Any yes requires the structural disclosure "damage disclosed" and a written description. There are wear notes, the ownership and authenticity declarations, and a notice that the marketplace doesn't certify used equipment.
9. **Preview.** `ListingPreview` shows what buyers will see.
10. **Publish.** Shows what's still missing, with links to those steps. Publishing sets `listing_status = 'active'`, and the database trigger has the final say. Its messages are mapped to friendly text and the step that fixes them (`mapListingError`).

Every step validates with zod in the browser's request and again on the server, and checks the signed-in user each time. Writes go through the seller's own session, so RLS applies. The service role is used only to inspect and delete storage objects. Live listings can be edited in place: steps 1–3 are locked, and saves change the live listing. Removed and expired listings can be relisted from step 10.

## Database (`supabase/migrations/20261102000200_selling.sql`)

- `asking_price_cents` may be empty only while a listing is a draft, so the draft can exist before step 6. A check constraint enforces this, and a trigger raises "Set an asking price before publishing" first.
- Listing photos added by members must use their own `<seller>/<listing>/` folder, at most 12 per listing.
- The last photo of a live listing can't be deleted.

`tests/db/selling.test.ts` covers these rules and re-running the migration.

## Tests

- `tests/unit/sell.test.ts`: attribute form generation and validation from the seeded `attribute_schema`, prefill, title suggestions, step schemas, photo checks, error mapping, readiness and profile validation.
- `tests/e2e/sell.spec.ts`:
  - The full bat flow with a real in-memory PNG upload, checked in the database and in Storage
  - Invalid file type
  - Resuming and deleting a draft
  - A publish error for an unanswered damage question
  - The catalog request path
  - Editing a live price, removing a listing and the read-only sold view
  - Profile edits with a taken username, an invalid state and an avatar upload
  - No horizontal overflow at 390 px for `/sell` and every step

  Test members are deleted afterwards.

## Limitations

- HEIC photos that the browser can't decode are stored as HEIC and display only in browsers that support it (Safari). There is no server-side conversion.
- The database checks the photo folder but not `image_url`. A member calling the API directly could point `image_url` at another host. The app always stores the public Storage URL.
- Uploads that fail between Storage and the `listing_images` insert (for example a closed tab) can leave orphan files in the seller's folder.
- Seller dashboard counts and tabs read up to 500 listings, with no pagination.
- The AI listing assistant isn't built. Featured listings, Stripe payouts and shipping labels belong to later phases.
- `tests/e2e/site.spec.ts` assumes there are no live listings and that `/listings/[id]` exists. It fails on this branch if anyone has live listings in the shared database, because the listing pages come from Track A.
