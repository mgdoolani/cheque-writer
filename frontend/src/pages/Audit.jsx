/**
 * Audit trail viewer (Section 9). Admin-only, and read-only by construction —
 * there is no endpoint that edits or deletes a row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatMoney } from '../lib/money.js';

const PAGE_SIZE = 40;
const DEBOUNCE_MS = 250;

/** Icon and tone per action, so the log can be skimmed rather than read. */
const ACTION_STYLE = {
  login: ['login', ''],
  login_failed: ['gpp_bad', 'is-danger'],
  logout: ['logout', ''],
  check_created: ['note_add', 'is-accent'],
  check_updated: ['edit', ''],
  check_printed: ['print', 'is-success'],
  check_reprinted: ['print', 'is-warn'],
  check_voided: ['block', 'is-danger'],
  check_previewed: ['visibility', ''],
  template_created: ['design_services', 'is-accent'],
  template_updated: ['design_services', ''],
  template_deleted: ['delete', 'is-danger'],
  payee_created: ['person_add', 'is-accent'],
  payee_updated: ['edit', ''],
  payee_deleted: ['person_remove', 'is-danger'],
  user_created: ['group_add', 'is-accent'],
  user_updated: ['manage_accounts', ''],
  password_changed: ['lock_reset', 'is-warn'],
  settings_updated: ['settings', 'is-warn'],
};

const prettyAction = (action) =>
  action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Turn the JSON detail blob into a short human phrase. */
function describe(entry) {
  const d = entry.detail || {};
  const bits = [];

  if (d.payee) bits.push(d.payee);
  if (d.amount !== undefined) bits.push(formatMoney(d.amount));
  if (d.name) bits.push(d.name);
  if (d.username && entry.action !== 'login') bits.push(d.username);
  if (d.checkNumber) bits.push(`no. ${d.checkNumber}`);
  if (d.printCount > 1) bits.push(`print #${d.printCount}`);
  if (d.batch) bits.push(`batch of ${d.count}`);
  if (d.keys?.length) bits.push(d.keys.join(', '));
  if (d.forced) bits.push('forced reset');
  if (d.dpi) bits.push(`${d.dpi} DPI`);
  if (d.fieldsChanged) bits.push('layout changed');
  if (d.deactivated) bits.push('deactivated');
  if (d.reason) bits.push(`“${d.reason}”`);

  return bits.join(' · ');
}

export default function Audit() {
  const [filters, setFilters] = useState({ action: '', userId: '', from: '', to: '', search: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ entries: [], total: 0 });
  const [meta, setMeta] = useState({ actionsInUse: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const requestId = useRef(0);

  useEffect(() => {
    api.get('/audit/meta').then(setMeta).catch(() => {});
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (String(v).trim()) params.set(k, String(v).trim());
    });
    return params;
  }, [filters]);

  const load = useCallback(async (params, from) => {
    const id = requestId.current + 1;
    requestId.current = id;

    setLoading(true);
    try {
      const withPaging = new URLSearchParams(params);
      withPaging.set('limit', String(PAGE_SIZE));
      withPaging.set('offset', String(from));
      const result = await api.get(`/audit?${withPaging}`);
      if (requestId.current !== id) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (requestId.current === id) setError(err.message);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(queryString, offset), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryString, offset, load]);

  const setFilter = (key) => (event) => {
    setOffset(0);
    setFilters((c) => ({ ...c, [key]: event.target.value }));
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Audit Trail</h1>
          <p>Who printed what, and when. Append-only — nothing here can be edited.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar__search">
          <Icon name="search" size={18} />
          <input
            className="input"
            placeholder="User or detail…"
            value={filters.search}
            onChange={setFilter('search')}
            aria-label="Search the audit trail"
          />
        </div>

        <select className="select" style={{ maxWidth: 210 }} value={filters.action} onChange={setFilter('action')} aria-label="Action">
          <option value="">Any action</option>
          {meta.actionsInUse.map((a) => (
            <option key={a} value={a}>{prettyAction(a)}</option>
          ))}
        </select>

        <select className="select" style={{ maxWidth: 170 }} value={filters.userId} onChange={setFilter('userId')} aria-label="User">
          <option value="">Anyone</option>
          {meta.users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>

        <input className="input" style={{ maxWidth: 155 }} type="date" value={filters.from} onChange={setFilter('from')} aria-label="From date" />
        <input className="input" style={{ maxWidth: 155 }} type="date" value={filters.to} onChange={setFilter('to')} aria-label="To date" />

        <div className="spacer" />
        <span className="subtle">{loading ? 'Loading…' : `${data.total} entries`}</span>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} /><span>{error}</span>
        </div>
      )}

      <div className="card">
        {data.entries.length === 0 && !loading ? (
          <div className="card__body">
            <EmptyState icon="history" title="Nothing recorded">
              No activity matches these filters.
            </EmptyState>
          </div>
        ) : (
          <ul className="auditlist">
            {data.entries.map((entry) => {
              const [icon, tone] = ACTION_STYLE[entry.action] || ['circle', ''];
              const summary = describe(entry);
              const open = expanded === entry.id;

              return (
                <li key={entry.id} className="auditrow">
                  <span className={`auditrow__icon ${tone}`}>
                    <Icon name={icon} size={17} />
                  </span>

                  <div className="auditrow__main">
                    <div className="auditrow__head">
                      <strong>{prettyAction(entry.action)}</strong>
                      {entry.entityType && (
                        <span className="badge">
                          {entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ''}
                        </span>
                      )}
                    </div>
                    {summary && <div className="auditrow__detail">{summary}</div>}
                    <div className="auditrow__meta subtle">
                      <Icon name="person" size={12} /> {entry.username}
                      {entry.fullName ? ` (${entry.fullName})` : ''}
                      {entry.ipAddress && <> · <Icon name="lan" size={12} /> {entry.ipAddress}</>}
                    </div>
                  </div>

                  <div className="auditrow__when">
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                    {Object.keys(entry.detail || {}).length > 0 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() => setExpanded(open ? null : entry.id)}
                        aria-label={open ? 'Hide raw detail' : 'Show raw detail'}
                        aria-expanded={open}
                      >
                        <Icon name={open ? 'expand_less' : 'data_object'} size={17} />
                      </button>
                    )}
                  </div>

                  {open && (
                    <pre className="auditrow__json">
                      {JSON.stringify(entry.detail, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {data.total > PAGE_SIZE && (
          <div className="pager">
            <button type="button" className="btn" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0 || loading}>
              <Icon name="chevron_left" size={18} /> Previous
            </button>
            <span className="subtle">Page {page} of {pages}</span>
            <button type="button" className="btn" onClick={() => setOffset((o) => o + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= data.total || loading}>
              Next <Icon name="chevron_right" size={18} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
