/**
 * The WHERE clause behind the cheque register.
 *
 * Shared by the list endpoint and the CSV export so that what you export is
 * exactly what you were looking at — two copies of this logic would eventually
 * disagree about which rows a filter matches.
 */

const STATUSES = ['draft', 'printed', 'void'];

/**
 * @param {object} q  the request query string
 * @returns {{ where: string, params: any[] }} `where` includes the WHERE keyword,
 *          or is empty when nothing was filtered.
 */
export function buildCheckFilters(q = {}) {
  const conditions = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('$?', `$${params.length}`));
  };

  if (q.search) {
    params.push(`%${String(q.search).toLowerCase()}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(lower(c.payee_name) LIKE ${p}
        OR lower(coalesce(c.check_number, '')) LIKE ${p}
        OR lower(coalesce(c.memo, '')) LIKE ${p})`,
    );
  }

  if (q.status && STATUSES.includes(q.status)) add('c.status = $?', q.status);
  if (q.payeeId) add('c.payee_id = $?', Number(q.payeeId));
  if (q.templateId) add('c.template_id = $?', Number(q.templateId));
  if (q.createdBy) add('c.created_by = $?', Number(q.createdBy));
  if (q.from) add('c.check_date >= $?::date', q.from);
  if (q.to) add('c.check_date <= $?::date', q.to);
  if (q.minAmount) add('c.amount >= $?', Number(q.minAmount));
  if (q.maxAmount) add('c.amount <= $?', Number(q.maxAmount));

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export const CHECK_STATUSES = STATUSES;
