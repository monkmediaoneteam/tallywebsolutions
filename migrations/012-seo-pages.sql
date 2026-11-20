-- Page-wise SEO overrides (Admin > SEO). One row per page path; path '*' holds the site-wide defaults.
-- Additive: the storefront reads this table tolerantly and falls back to built-in defaults when it is missing.
create table if not exists seo_pages (
  path       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
