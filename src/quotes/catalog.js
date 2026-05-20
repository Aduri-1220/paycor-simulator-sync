import fs from 'fs';

export function loadCatalogFile(catalogPath) {
  const raw = fs.readFileSync(catalogPath, 'utf8');
  const data = JSON.parse(raw);
  const policy = data.policy ?? {};
  const products = Array.isArray(data.products) ? data.products : [];
  const bySku = new Map();
  for (const p of products) {
    bySku.set(p.sku, p);
  }
  return {
    policy: {
      min_margin_pct: policy.min_margin_pct ?? 15,
      max_discount_pct: policy.max_discount_pct ?? 20,
    },
    products,
    bySku,
  };
}

export function syncCatalogToDb(db, catalog) {
  const stmt = db.prepare(
    `INSERT INTO product_catalog (sku, name, description, unit, list_price, cost, active)
     VALUES (@sku, @name, @description, @unit, @list_price, @cost, @active)
     ON CONFLICT(sku) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       unit = excluded.unit,
       list_price = excluded.list_price,
       cost = excluded.cost,
       active = excluded.active`
  );
  const tx = db.transaction(() => {
    for (const p of catalog.products) {
      stmt.run({
        sku: p.sku,
        name: p.name,
        description: p.description ?? '',
        unit: p.unit,
        list_price: p.list_price,
        cost: p.cost,
        active: p.active === false ? 0 : 1,
      });
    }
  });
  tx();
}

export function getCatalogFromDb(db) {
  const rows = db
    .prepare(
      `SELECT sku, name, description, unit, list_price, cost, active
       FROM product_catalog ORDER BY sku`
    )
    .all();
  const policyRow = db.prepare('SELECT COUNT(*) AS n FROM product_catalog').get();
  if (!policyRow || policyRow.n === 0) {
    return null;
  }
  const products = rows.map((r) => ({
    sku: r.sku,
    name: r.name,
    description: r.description,
    unit: r.unit,
    list_price: r.list_price,
    cost: r.cost,
    active: r.active === 1,
  }));
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return { products, bySku, policy: { min_margin_pct: 15, max_discount_pct: 20 } };
}

export function loadCatalog(db, catalogPath) {
  const fromDb = getCatalogFromDb(db);
  if (fromDb && fromDb.products.length > 0) {
    const fileCatalog = loadCatalogFile(catalogPath);
    return { ...fromDb, policy: fileCatalog.policy };
  }
  const fileCatalog = loadCatalogFile(catalogPath);
  syncCatalogToDb(db, fileCatalog);
  return fileCatalog;
}
