/**
 * Cheque register (Section 6): every cheque written, with search and filters.
 *
 * The CSV export reuses the same query string as the list, and the server
 * builds both WHERE clauses from one function — so the file you download is
 * exactly the rows you were looking at.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatusBadge from '../components/checks/StatusBadge.jsx';
import PrintDialog from '../components/checks/PrintDialog.jsx';
import VoidDialog from '../components/checks/VoidDialog.jsx';
import { formatMoney } from '../lib/money.js';

const PAGE_SIZE = 25;
const DEBOUNCE_MS = 250;

const BLANK_FILTERS = {
  search: '', status: '', from: '', to: '', minAmount: '', maxAmount: '',
};

export default function Cheques() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ checks: [], total: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const [printing, setPrinting] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [voiding, setVoiding] = useState(null);
  const [voidWorking, setVoidWorking] = useState(false);

  const requestId = useRef(0);

  /** Filters as a query string — shared by the list request and the CSV link. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (String(value).trim()) params.set(key, String(value).trim());
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

      const result = await api.get(`/checks?${withPaging}`);
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

  // Needed so the print dialog can show Print Options for the cheque's template.
  useEffect(() => {
    api.get('/templates?includeInactive=true')
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, []);

  const setFilter = (key) => (event) => {
    setOffset(0);
    setFilters((c) => ({ ...c, [key]: event.target.value }));
  };

  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => key !== 'search' && String(value).trim(),
  ).length;

  async function handleVoid(reason) {
    setVoidWorking(true);
    try {
      await api.post(`/checks/${voiding.id}/void`, { reason });
      toast.success(`Cheque #${voiding.id} voided`);
      setVoiding(null);
      load(queryString, offset);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setVoidWorking(false);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Cheque Register</h1>
          <p>Every cheque written, searchable and exportable.</p>
        </div>
        <a
          className="btn"
          href={`/api/reports/register.csv?${queryString}`}
          download
        >
          <Icon name="download" size={18} />
          Export CSV
        </a>
      </div>

      <div className="toolbar">
        <div className="toolbar__search">
          <Icon name="search" size={18} />
          <input
            className="input"
            placeholder="Payee, cheque number or memo…"
            value={filters.search}
            onChange={setFilter('search')}
            aria-label="Search cheques"
          />
          {filters.search && (
            <button
              type="button"
              className="toolbar__clear"
              onClick={() => setFilters((c) => ({ ...c, search: '' }))}
              aria-label="Clear search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`btn ${showFilters || activeFilters ? 'btn--primary' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <Icon name="filter_list" size={18} />
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>

        {activeFilters > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => { setFilters({ ...BLANK_FILTERS, search: filters.search }); setOffset(0); }}
          >
            Clear
          </button>
        )}

        <div className="spacer" />
        <span className="subtle">
          {loading ? 'Loading…' : (
            <>
              <strong>{data.total}</strong> cheque{data.total === 1 ? '' : 's'} ·{' '}
              <strong className="mono">{formatMoney(data.totalAmount)}</strong>
            </>
          )}
        </span>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="card__body">
            <div className="filtergrid">
              <div className="field">
                <label className="field__label" htmlFor="f-status">Status</label>
                <select id="f-status" className="select" value={filters.status} onChange={setFilter('status')}>
                  <option value="">Any</option>
                  <option value="draft">Draft</option>
                  <option value="printed">Printed</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="f-from">Dated from</label>
                <input id="f-from" className="input" type="date" value={filters.from} onChange={setFilter('from')} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="f-to">Dated to</label>
                <input id="f-to" className="input" type="date" value={filters.to} onChange={setFilter('to')} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="f-min">Amount from</label>
                <input id="f-min" className="input mono" type="number" step="0.01" value={filters.minAmount} onChange={setFilter('minAmount')} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="f-max">Amount to</label>
                <input id="f-max" className="input mono" type="number" step="0.01" value={filters.maxAmount} onChange={setFilter('maxAmount')} />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <Icon name="error" size={18} /><span>{error}</span>
        </div>
      )}

      <div className="card">
        {data.checks.length === 0 && !loading ? (
          <div className="card__body">
            <EmptyState icon="receipt_long" title="Nothing matches">
              {activeFilters || filters.search
                ? 'Try widening the search or clearing the filters.'
                : 'No cheques have been written yet.'}
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee</th>
                  <th className="table__num">Amount</th>
                  <th>Cheque no.</th>
                  <th>Status</th>
                  <th>Written by</th>
                  <th className="table__actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map((c) => (
                  <tr key={c.id} className={c.status === 'void' ? 'is-inactive' : ''}>
                    <td>
                      <div className="mono">{c.dateText || c.checkDate}</div>
                      <div className="table__sub mono">#{c.id}</div>
                    </td>
                    <td>
                      <div className="table__primary">{c.payeeName}</div>
                      {c.memo && <div className="table__sub">{c.memo}</div>}
                    </td>
                    <td className="table__num mono">{c.amountFormatted}</td>
                    <td className="mono">{c.checkNumber || <span className="subtle">—</span>}</td>
                    <td><StatusBadge status={c.status} printCount={c.printCount} /></td>
                    <td className="table__sub">{c.createdBy || '—'}</td>
                    <td className="table__actions">
                      {c.status !== 'void' && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setPrinting(c)}
                          title={c.printCount ? 'Preview or reprint' : 'Preview and print'}
                          aria-label={`Print cheque ${c.id}`}
                        >
                          <Icon name="print" size={19} />
                        </button>
                      )}
                      {isAdmin && c.status !== 'void' && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => setVoiding(c)}
                          title="Void this cheque"
                          aria-label={`Void cheque ${c.id}`}
                        >
                          <Icon name="block" size={19} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.total > PAGE_SIZE && (
          <div className="pager">
            <button
              type="button"
              className="btn"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0 || loading}
            >
              <Icon name="chevron_left" size={18} /> Previous
            </button>
            <span className="subtle">Page {page} of {pages}</span>
            <button
              type="button"
              className="btn"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= data.total || loading}
            >
              Next <Icon name="chevron_right" size={18} />
            </button>
          </div>
        )}
      </div>

      <PrintDialog
        check={printing}
        template={templates.find((t) => t.id === printing?.templateId) || null}
        onTemplateChanged={(updated) =>
          setTemplates((current) =>
            current.map((t) => (t.id === updated.id ? updated : t)),
          )}
        onClose={() => setPrinting(null)}
        onPrinted={() => { setPrinting(null); load(queryString, offset); }}
        onViewRegister={() => setPrinting(null)}
      />

      <VoidDialog
        check={voiding}
        working={voidWorking}
        onCancel={() => setVoiding(null)}
        onConfirm={handleVoid}
      />
    </>
  );
}
