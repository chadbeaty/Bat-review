-- AGED TAKES — uploaded evidence files (screenshots, filing PDFs) kept in the private "evidence-files" bucket.
-- The file itself is never public; editors open it through a short-lived signed link.

alter table public.evidence_sources
  add column if not exists file_path text check (file_path is null or file_path ~ '^sources/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  add column if not exists file_mime text check (file_mime is null or file_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  add column if not exists file_size integer check (file_size is null or file_size between 1 and 20971520),
  add column if not exists file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[a-f0-9]{64}$');
