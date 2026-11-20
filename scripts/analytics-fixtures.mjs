/** Sample real-looking orders for the isolated preview, so the Analytics screen has something to draw. Never used on a real database. */
export async function seedAnalyticsDemo(db) {
  const { rows: books } = await db.query(`select slug, title, price_inr from books where facts->>'_demo' = 'true' order by sort limit 12`);
  if (!books.length) return 0;
  await db.exec(`insert into offers(id,name,kind,scope,value,status,code) values('demo-offer','Festival 20%','percent','all',20,'active','FESTIVAL20') on conflict (id) do nothing`);
  let n = 0, seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let day = 0; day < 100; day++) {
    const count = Math.floor(rand() * 4 * (day < 30 ? 1.4 : 0.8));
    for (let i = 0; i < count; i++) {
      const picks = [books[Math.floor(rand() * rand() * books.length)]];
      if (rand() > 0.7) picks.push(books[Math.floor(rand() * books.length)]);
      const items = picks.map((b) => ({ slug: b.slug, title: b.title, price: b.price_inr, discount: 0, list_price: b.price_inr }));
      const total = items.reduce((s, x) => s + x.price, 0);
      const r = rand();
      const status = r < 0.8 ? 'fulfilled' : r < 0.86 ? 'payment_failed' : r < 0.93 ? 'created' : 'refunded';
      const id = `preview-order-${n++}`;
      const email = `customer${Math.floor(rand() * 25)}@example.in`;
      const when = `now() - interval '${day} days' - interval '${Math.floor(rand() * 22)} hours'`;
      const paid = status === 'fulfilled' || status === 'refunded';
      await db.query(`insert into orders(id,email,name,items,subtotal,total,status,created_at,paid_at,refunded_at) values($1,$2,$3,$4::jsonb,$5,$5,$6,${when},${paid ? when : 'null'},${status === 'refunded' ? when : 'null'})`,
        [id, email, `Customer ${email.slice(8, 10)}`, JSON.stringify(items), total, status]);
      if (status === 'fulfilled' && rand() > 0.4) await db.query(`insert into downloads(order_id,book_slug,count,last_at) values($1,$2,$3,${when})`, [id, items[0].slug, 1 + Math.floor(rand() * 3)]);
      if (status === 'fulfilled' && rand() > 0.85) await db.query(`insert into offer_redemptions(offer_id,order_id,email,discount) values('demo-offer',$1,$2,$3)`, [id, email, Math.round(total / 5)]);
      if (rand() > 0.8) await db.query(`insert into wishlist(reader_id,book_slug,created_at) values($1,$2,${when}) on conflict do nothing`, [`reader-${n}`, books[Math.floor(rand() * books.length)].slug]);
    }
  }
  return n;
}
