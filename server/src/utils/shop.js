const ID_CARD = { id: 'id-change-card', name: 'Thẻ đổi ID', price: 30,
  description: 'Đổi ID tài khoản một lần. Thẻ được tiêu hao khi đổi thành công.' };
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function normalizePublicId(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(id)) fail(400, 'ID cần 3–24 ký tự: chữ không dấu, số, dấu gạch ngang hoặc gạch dưới.');
  if (/^ytmt-\d+$/.test(id)) fail(400, 'ID dạng ytmt- kèm số được dành cho tài khoản mới.');
  return id;
}

async function shopAction(pool, accountId, { requestId, action, itemId, newId, quantity = 1 }) {
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) fail(400, 'Yêu cầu không hợp lệ.');
  if (itemId !== ID_CARD.id || !['buy', 'use'].includes(action)) fail(400, 'Vật phẩm không hợp lệ.');
  const id = action === 'use' ? normalizePublicId(newId) : '';
  const count = action === 'buy' ? quantity : 1;
  if (!Number.isSafeInteger(count) || count < 1 || count > 2147483647) fail(400, 'Số lượng không hợp lệ.');
  // Preserve existing one-item request fingerprints for retries after deployment.
  const payload = JSON.stringify({ itemId, newId: id, ...(count === 1 ? {} : { quantity: count }) });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const account = (await db.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [accountId])).rows[0];
    if (!account) fail(401, 'Vui lòng đăng nhập lại.');
    const previous = (await db.query('SELECT action,payload,result FROM account_shop_actions WHERE account_id=$1 AND request_id=$2', [accountId, requestId])).rows[0];
    if (previous) {
      if (previous.action !== action || previous.payload !== payload) fail(409, 'Yêu cầu này đã được sử dụng.');
      await db.query('COMMIT');
      return { ...previous.result, replayed: true };
    }
    let result;
    if (action === 'buy') {
      const total = BigInt(ID_CARD.price) * BigInt(count);
      const wallet = (await db.query('SELECT notes,fixed_notes FROM account_profiles WHERE id=$1 FOR UPDATE', [accountId])).rows[0];
      if (!wallet || (wallet.fixed_notes == null && BigInt(wallet.notes) < total)) fail(400, 'Bạn chưa đủ Notes để mua số lượng này.');
      const balance = (await db.query('UPDATE account_profiles SET notes=notes-$2,updated_at=now() WHERE id=$1 RETURNING notes', [accountId, String(total)])).rows[0];
      const inventory = (await db.query(`INSERT INTO account_inventory(account_id,item_id,quantity) VALUES($1,$2,$3)
        ON CONFLICT(account_id,item_id) DO UPDATE SET quantity=account_inventory.quantity+$3 RETURNING quantity`, [accountId, itemId, count])).rows[0];
      result = { itemId, quantity: inventory.quantity, purchased: count, total: String(total), notes: balance.notes, price: ID_CARD.price };
    } else {
      if (id === account.public_id.toLowerCase()) fail(400, 'ID mới đang trùng với ID hiện tại.');
      if (id === 'admindeptrai' && account.id !== 'd7d6fe17-3b15-4de1-b2ca-33d6fa414dc6') fail(409, 'ID này không khả dụng.');
      // Keep this previously promised special ID reserved for its owner.
      if (id === 'lycutihihi' && account.public_id !== id) fail(409, 'ID này không khả dụng.');
      const used = (await db.query('SELECT id FROM accounts WHERE lower(public_id)=$1', [id])).rowCount;
      if (used) fail(409, 'ID này đã có người sử dụng.');
      const inventory = (await db.query('UPDATE account_inventory SET quantity=quantity-1 WHERE account_id=$1 AND item_id=$2 AND quantity>0 RETURNING quantity', [accountId, itemId])).rows[0];
      if (!inventory) fail(400, 'Bạn chưa có Thẻ đổi ID trong túi đồ.');
      await db.query('UPDATE accounts SET public_id=$2,updated_at=now() WHERE id=$1', [accountId, id]);
      result = { itemId, quantity: inventory.quantity, publicId: id, previousId: account.public_id };
    }
    await db.query('INSERT INTO account_shop_actions(account_id,request_id,action,payload,result) VALUES($1,$2,$3,$4,$5)', [accountId, requestId, action, payload, JSON.stringify(result)]);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    if (error.code === '23505') fail(409, 'ID này đã có người sử dụng.');
    if (error.code === '22003') fail(400, 'Số lượng vượt khả năng lưu trữ. Vui lòng chọn số lượng nhỏ hơn.');
    throw error;
  } finally { db.release(); }
}
module.exports = { ID_CARD, normalizePublicId, shopAction };
