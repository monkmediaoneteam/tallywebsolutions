-- Banner sections (Admin > Banners > Sections) are stored as content modules of type 'banner-section'.
do $$ begin
  alter table content_modules drop constraint if exists content_modules_type_check;
  alter table content_modules add constraint content_modules_type_check check (type in
    ('hero','banner','banner-section','text','collection','testimonial','author','media','announcement','promo','genre-switcher'));
end $$;
