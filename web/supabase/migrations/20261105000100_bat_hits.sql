-- Optional "about how many hits?" answer for bat listings. It feeds the Life meter on the listing page.
-- Listing attributes are free-form JSON validated by the app against product_categories.attribute_schema, so this
-- only extends the bats category's schema (the sell form, its validation and the listing page all read it from there).
-- Safe to run more than once: the field is added only when it isn't already there.

update public.product_categories
set attribute_schema = attribute_schema || jsonb_build_array(
  jsonb_build_object(
    'key', 'approx_hits',
    'label', 'About how many hits?',
    'type', 'number',
    'required', false,
    'min', 0,
    'max', 10000,
    'help', 'Rough is fine. Composite bats break in over the first 150–200 hits.'
  )
)
where slug = 'bats'
  and not exists (
    select 1 from jsonb_array_elements(attribute_schema) as f where f ->> 'key' = 'approx_hits'
  );
