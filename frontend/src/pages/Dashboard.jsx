/**
 * Landing screen after sign-in.
 *
 * Figures come from /api/reports/dashboard. Voided cheques are excluded from
 * the money totals — a void cheque was never a payment.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import StatusBadge from '../components/checks/StatusBadge.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { api } from '../api/client.js';
import { formatMoney } from '../lib/money.js';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const STATS = [
  {
    key: 'month',
    icon: 'receipt_long',
    label: 'Cheques this month',
    hint: 'Dated in the current month, excluding voided',
    value: (d) => d.monthCount,
  },
  {
    key: 'value',
    icon: 'payments',
    label: 'Value this month',
    hint: 'Sum of those cheques',
    value: (d) => formatMoney(d.monthAmount),
  },
  {
    key: 'pending',
    icon: 'pending_actions',
    label: 'Awaiting print',
    hint: 'Saved but not yet printed',
    value: (d) => d.awaitingPrint,
    to: '/cheques?status=draft',
  },
  {
    key: 'payees',
    icon: 'contacts',
    label: 'Active payees',
    hint: 'In the payee book',
    value: (d) => d.activePayees,
  },
];

const ACTIONS = [
  {
    to: '/cheques/new',
    icon: 'note_add',
    title: 'Write a cheque',
    body: 'Payee, amount and date. The amount in words is filled in for you.',
    primary: true,
  },
  {
    to: '/cheques',
    icon: 'receipt_long',
    title: 'Cheque register',
    body: 'Everything written so far, with search and filters.',
  },
  {
    to: '/payees',
    icon: 'contacts',
    title: 'Payees',
    body: 'Save the people and firms you pay regularly.',
  },
  {
    to: '/templates',
    icon: 'design_services',
    title: 'Bank templates',
    body: 'Position the fields once per bank, then reuse them.',
  },
];

/** First-run guidance. Admin-only, because every step needs admin rights. */
const SETUP_STEPS = [
  {
    icon: 'straighten',
    title: 'Measure your cheque stock',
    body: 'Width and height in millimetres. Everything else is positioned against it.',
    to: '/templates',
    cta: 'Open templates',
  },
  {
    icon: 'drag_pan',
    title: 'Position the fields for each bank',
    body: 'Scan a blank cheque, drag each field onto it, save once. Module 6.',
    to: '/templates',
    cta: 'Open templates',
  },
  {
    icon: 'tune',
    title: 'Set the currency word and date format',
    body: 'Controls how amounts read in words and how dates print. Module 8.',
    to: '/settings',
    cta: 'Open settings',
  },
];

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const today = new Date();

  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/reports/dashboard').then(setStats).catch(() => setFailed(true));
  }, []);

  return (
    <>
      <div className="page__head">
        <div>
          <h1>
            {greeting(today)}, {user?.fullName?.split(' ')[0] || user?.username}
          </h1>
          <p>
            {today.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <Link to="/cheques/new" className="btn btn--primary">
          <Icon name="note_add" size={18} />
          New cheque
        </Link>
      </div>

      <div className="stack">
        <div className="stats">
          {STATS.map((stat) => (
            <div className="card stat" key={stat.key}>
              <div className="card__body">
                <div className="stat__label">
                  <Icon name={stat.icon} size={16} />
                  {stat.label}
                </div>
                <div className="stat__value mono">
                  {stats ? stat.value(stats) : <span className="subtle">…</span>}
                </div>
                <p className="subtle stat__hint">{stat.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {failed && (
          <div className="alert alert--warn">
            <Icon name="warning" size={18} />
            <span>Could not load the figures. The rest of the page still works.</span>
          </div>
        )}

        {stats?.recent?.length > 0 && (
          <section>
            <h2 className="section-title">Recently written</h2>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Payee</th>
                      <th className="table__num">Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((c) => (
                      <tr key={c.id}>
                        <td className="table__primary">{c.payeeName}</td>
                        <td className="table__num mono">{formatMoney(c.amount)}</td>
                        <td className="mono">{c.checkDate}</td>
                        <td><StatusBadge status={c.status} printCount={c.printCount} /></td>
                        <td className="table__sub">{c.createdBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className="section-title">Jump to</h2>
          <div className="actions">
            {ACTIONS.map((action) => (
              <Link
                to={action.to}
                key={action.to}
                className={`card action${action.primary ? ' action--primary' : ''}`}
              >
                <span className="action__icon">
                  <Icon name={action.icon} size={22} />
                </span>
                <span className="action__text">
                  <span className="action__title">{action.title}</span>
                  <span className="muted">{action.body}</span>
                </span>
                <Icon name="chevron_right" size={20} className="action__chevron" />
              </Link>
            ))}
          </div>
        </section>

        {isAdmin && (
          <section>
            <h2 className="section-title">Setting up</h2>
            <div className="card">
              <div className="card__body stack">
                {SETUP_STEPS.map((step, index) => (
                  <div className="step" key={step.title}>
                    <span className="step__number">{index + 1}</span>
                    <span className="step__icon">
                      <Icon name={step.icon} size={19} />
                    </span>
                    <span className="step__text">
                      <span className="action__title">{step.title}</span>
                      <span className="muted">{step.body}</span>
                    </span>
                    <Link to={step.to} className="btn">
                      {step.cta}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
