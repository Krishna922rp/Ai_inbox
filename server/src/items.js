export function listItems(db, query = '') {
  const counts = db.prepare(
    "SELECT COUNT(*) AS total, " +
    "COALESCE(SUM(CASE WHEN type = 'note' THEN 1 ELSE 0 END), 0) AS notes, " +
    "COALESCE(SUM(CASE WHEN type = 'url' THEN 1 ELSE 0 END), 0) AS links " +
    "FROM items"
  ).get();

  const select = 'SELECT id, type, title, url, substr(content, 1, 220) AS content_preview, created_at FROM items';
  const rows = query
    ? db.prepare(
        select +
        ' WHERE instr(lower(title), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0 ORDER BY id DESC'
      ).all(query, query)
    : db.prepare(select + ' ORDER BY id DESC').all();

  return {
    items: rows,
    counts: {
      total: Number(counts.total),
      notes: Number(counts.notes),
      links: Number(counts.links)
    }
  };
}
