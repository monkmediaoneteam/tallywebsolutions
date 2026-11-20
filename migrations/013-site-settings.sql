-- Site-wide settings edited in Admin: the homepage layout (key 'home_layout') and the theme (key 'theme').
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
