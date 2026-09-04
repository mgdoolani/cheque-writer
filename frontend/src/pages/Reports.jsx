/**
 * Monthly summary and breakdowns (Section 6).
 *
 * Voided cheques are shown as a separate count and kept OUT of money totals —
 * a void cheque was never a payment, and folding it in would overstate what
 * actually left the account.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatMoney } from '../lib/money.js';
import { useBranding } from '../branding/BrandingProvider.jsx';

export default function Reports() {
  const { companyName } = useBranding();
  const [year, setYear] = useState(new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [monthly, setMonthly] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/reports/years')
      .then((d) => {
        setYears(d.years);
        if (d.years.length && !d.years.includes(year)) setYear(d.years[0]);
      })
      .catch(() => {});
    // Only on mount: picking a year afterwards must not re-snap the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (forYear) => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api.get(`/reports/monthly?year=${forYear}`),
        api.get(`/reports/summary?from=${forYear}-01-01&to=${forYear}-12-31`),
      ]);
      setMonthly(m);
      setSummary(s);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  if (error) {
    return (
      <div className="alert alert--danger">
        <Icon name="error" size={18} /><span>{error}</span>
      </div>
    );
  }

  const peak = Math.max(1, ...(monthly?.months || []).map((m) => m.amount));

  return (
    <>
      <div className="page__head">
        <div>
          <h1>Reports</h1>
          <p>
            {companyName ? <><strong>{companyName}</strong> — monthly totals and
              where the money went.</> : 'Monthly totals and where the money went.'}
          </p>
        </div>
        <div className="field" style={{ minWidth: 130 }}>
          <label className="sr-only" htmlFor="r-year">Year</label>
          <select
            id="r-year"
            className="select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading && !monthly ? (
        <div className="splash" style={{ minHeight: '30vh' }}>
          <span className="spinner" /><span className="muted">Loading…</span>
        </div>
      ) : (
        <div className="stack">
          <div className="stats">
            <div className="card"><div className="card__body">
              <div className="stat__label"><Icon name="receipt_long" size={16} />Cheques in {year}</div>
              <div className="stat__value mono">{monthly?.total.count ?? 0}</div>
              <p className="subtle stat__hint">Excludes voided</p>
            </div></div>
            <div className="card"><div className="card__body">
              <div className="stat__label"><Icon name="payments" size={16} />Total value</div>
              <div className="stat__value mono">{formatMoney(monthly?.total.amount)}</div>
              <p className="subtle stat__hint">Drafts and printed</p>
            </div></div>
            <div className="card"><div className="card__body">
              <div className="stat__label"><Icon name="print" size={16} />Printed</div>
              <div className="stat__value mono">{summary?.byStatus.printed.count ?? 0}</div>
              <p className="subtle stat__hint">{formatMoney(summary?.byStatus.printed.amount)}</p>
            </div></div>
            <div className="card"><div className="card__body">
              <div className="stat__label"><Icon name="block" size={16} />Voided</div>
              <div className="stat__value mono">{monthly?.total.voided ?? 0}</div>
              <p className="subtle stat__hint">Not counted in totals</p>
            </div></div>
          </div>

          <section className="card">
            <div className="card__header"><h3>Monthly summary — {year}</h3></div>
            <div className="card__body">
              {monthly?.total.count === 0 ? (
                <EmptyState icon="monitoring" title={`No cheques dated in ${year}`}>
                  Pick another year, or write a cheque to start the register.
                </EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="table__num">Cheques</th>
                        <th className="table__num">Amount</th>
                        <th style={{ width: '45%' }}>Share of the busiest month</th>
                        <th className="table__num">Void</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.months.map((m) => (
                        <tr key={m.month} className={m.count === 0 ? 'is-quiet' : ''}>
                          <td className="table__primary">{m.label}</td>
                          <td className="table__num mono">{m.count || <span className="subtle">—</span>}</td>
                          <td className="table__num mono">
                            {m.amount ? formatMoney(m.amount) : <span className="subtle">—</span>}
                          </td>
                          <td>
                            <div className="bar">
                              <div
                                className="bar__fill"
                                style={{ width: `${(m.amount / peak) * 100}%` }}
                                aria-hidden="true"
                              />
                            </div>
                          </td>
                          <td className="table__num mono">
                            {m.voided || <span className="subtle">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th className="table__num mono">{monthly.total.count}</th>
                        <th className="table__num mono">{formatMoney(monthly.total.amount)}</th>
                        <th />
                        <th className="table__num mono">{monthly.total.voided}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </section>

          <div className="reports-split">
            <section className="card">
              <div className="card__header"><h3>Top payees</h3></div>
              <div className="card__body">
                {summary?.byPayee.length ? (
                  <table className="table">
                    <thead>
                      <tr><th>Payee</th><th className="table__num">Cheques</th><th className="table__num">Amount</th></tr>
                    </thead>
                    <tbody>
                      {summary.byPayee.map((p) => (
                        <tr key={p.payeeName}>
                          <td className="table__primary">{p.payeeName}</td>
                          <td className="table__num mono">{p.count}</td>
                          <td className="table__num mono">{formatMoney(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="muted">Nothing in {year}.</p>}
              </div>
            </section>

            <section className="card">
              <div className="card__header"><h3>By bank template</h3></div>
              <div className="card__body">
                {summary?.byTemplate.length ? (
                  <table className="table">
                    <thead>
                      <tr><th>Template</th><th className="table__num">Cheques</th><th className="table__num">Amount</th></tr>
                    </thead>
                    <tbody>
                      {summary.byTemplate.map((t) => (
                        <tr key={t.name}>
                          <td className="table__primary">{t.name}</td>
                          <td className="table__num mono">{t.count}</td>
                          <td className="table__num mono">{formatMoney(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="muted">Nothing in {year}.</p>}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
