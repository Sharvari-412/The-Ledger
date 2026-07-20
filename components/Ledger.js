'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (n) => {
  const sign = n < 0 ? '-' : '';
  return sign + inrFormatter.format(Math.abs(n));
};

export default function Ledger({ session }) {
  const user = session.user;

  const [entries, setEntries] = useState([]);
  const [goal, setGoal] = useState(null);
  const [startingBalance, setStartingBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const [currentType, setCurrentType] = useState('expense');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');

  const [startInput, setStartInput] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [contributeAmt, setContributeAmt] = useState('');

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);

    const [entriesRes, goalRes, settingsRes] = await Promise.all([
      supabase.from('entries').select('*').order('created_at', { ascending: true }),
      supabase.from('goals').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    if (entriesRes.data) setEntries(entriesRes.data);
    if (goalRes.data && goalRes.data.length > 0) setGoal(goalRes.data[0]);
    if (settingsRes.data) {
      setStartingBalance(Number(settingsRes.data.starting_balance));
      setStartInput(String(settingsRes.data.starting_balance));
    }

    setLoading(false);
  }

  async function setStartBalance() {
    const v = parseFloat(startInput);
    const value = isNaN(v) ? 0 : v;
    setStartingBalance(value);
    await supabase
      .from('settings')
      .upsert({ user_id: user.id, starting_balance: value }, { onConflict: 'user_id' });
  }

  async function addEntry() {
    const amount = parseFloat(amt);
    if (isNaN(amount) || amount <= 0) return;

    const description = desc.trim() || (currentType === 'expense' ? 'Untitled expense' : 'Untitled income');

    const { data, error } = await supabase
      .from('entries')
      .insert({ user_id: user.id, description, amount, type: currentType })
      .select()
      .single();

    if (!error && data) {
      setEntries((prev) => [...prev, data]);
      setDesc('');
      setAmt('');
    }
  }

  async function deleteEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await supabase.from('entries').delete().eq('id', id);
  }

  async function createGoal() {
    const target = parseFloat(goalTarget);
    if (isNaN(target) || target <= 0) return;

    const name = goalName.trim() || 'Savings goal';

    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: user.id, name, target, saved: 0 })
      .select()
      .single();

    if (!error && data) {
      setGoal(data);
      setGoalName('');
      setGoalTarget('');
    }
  }

  async function contributeToGoal() {
    const amount = parseFloat(contributeAmt);
    if (isNaN(amount) || amount <= 0 || !goal) return;

    const newSaved = Number(goal.saved) + amount;
    setGoal({ ...goal, saved: newSaved });
    setContributeAmt('');

    await supabase.from('goals').update({ saved: newSaved }).eq('id', goal.id);
  }

  async function removeGoal() {
    if (!goal) return;
    const goalId = goal.id;
    setGoal(null);
    await supabase.from('goals').delete().eq('id', goalId);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  let running = startingBalance;
  let totalIn = 0;
  let totalOut = 0;
  const rows = entries.map((e, i) => {
    const signedAmt = e.type === 'income' ? Number(e.amount) : -Number(e.amount);
    running += signedAmt;
    if (e.type === 'income') totalIn += Number(e.amount);
    else totalOut += Number(e.amount);
    return { ...e, index: i + 1, runningBalance: running };
  });

  const goalPct = goal ? Math.min(100, (Number(goal.saved) / Number(goal.target)) * 100) : 0;
  const goalRemaining = goal ? Number(goal.target) - Number(goal.saved) : 0;

  if (loading) {
    return <div className="loading-state">Loading your ledger…</div>;
  }

  return (
    <div className="wrap">
      <div className="masthead">
        <div className="kicker">Personal Accounts</div>
        <h1>The Ledger</h1>
        <div className="rule"></div>
      </div>

      <div className="user-bar">
        <span>{user.email}</span>
        <button onClick={handleSignOut}>Sign out</button>
      </div>

      <div className="balance-card">
        <div className="label">Current Balance</div>
        <div className={`amount ${running < 0 ? 'negative' : 'positive'}`}>{money(running)}</div>
        <div className="balance-meta">
          <span>In: <b>{money(totalIn)}</b></span>
          <span>Out: <b>{money(totalOut)}</b></span>
          <span>Entries: <b>{entries.length}</b></span>
        </div>
        <div className="start-row">
          <span>Starting balance (₹)</span>
          <input
            type="number"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            placeholder="0.00"
            step="0.01"
          />
          <button onClick={setStartBalance}>Set</button>
        </div>
      </div>

      <div className="entry-form">
        <h2>Add an entry</h2>
        <div className="toggle-row">
          <button
            className={currentType === 'expense' ? 'active expense' : 'expense'}
            onClick={() => setCurrentType('expense')}
            type="button"
          >
            Expense
          </button>
          <button
            className={currentType === 'income' ? 'active income' : 'income'}
            onClick={() => setCurrentType('income')}
            type="button"
          >
            Income
          </button>
        </div>
        <div className="form-row">
          <input
            type="text"
            className="desc"
            placeholder="What was it for?"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          />
          <input
            type="number"
            className="amt"
            placeholder="₹0.00"
            step="0.01"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          />
          <button className="add-btn" onClick={addEntry}>Add</button>
        </div>
      </div>

      <div className="ledger-section">
        <h2>Transactions</h2>
        <div className="ledger-rows">
          {rows.length === 0 ? (
            <div className="empty-state">No entries yet — add your first expense or income above.</div>
          ) : (
            rows.map((e) => (
              <div className="ledger-row" key={e.id}>
                <span className="idx">{String(e.index).padStart(2, '0')}</span>
                <span className="desc">{e.description}</span>
                <span className={`delta ${e.type === 'income' ? 'in' : 'out'}`}>
                  {e.type === 'income' ? '+' : '−'}{money(Number(e.amount))}
                </span>
                <span className="running">{money(e.runningBalance)}</span>
                <button className="del" onClick={() => deleteEntry(e.id)} title="Remove">✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="goal-card">
        <h2>Savings Goal</h2>
        <div className="goal-sub">Set a target and track your progress</div>

        {!goal ? (
          <div className="no-goal-form">
            <input
              type="text"
              placeholder="What are you saving for? (e.g. New laptop)"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
            />
            <input
              type="number"
              placeholder="Target ₹"
              step="0.01"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
            />
            <button onClick={createGoal}>Set goal</button>
          </div>
        ) : (
          <div className="goal-active">
            <div className="goal-figures">
              <div>
                <div className="saved">{money(Number(goal.saved))}</div>
                <div className="goal-name-label">{goal.name}</div>
              </div>
              <div className="target">of {money(Number(goal.target))}</div>
            </div>

            <div className="gauge">
              <div className="gauge-fill" style={{ width: `${goalPct}%` }}></div>
              <div className="gauge-ticks">
                {Array.from({ length: 10 }).map((_, i) => <span key={i}></span>)}
              </div>
              <div className="gauge-label">{Math.round(goalPct)}%</div>
            </div>

            <div className={`goal-remaining ${goalRemaining <= 0 ? 'done' : ''}`}>
              {goalRemaining <= 0
                ? `🎉 Goal reached! You saved ${money(Number(goal.saved))}.`
                : <>Still need <b>{money(goalRemaining)}</b> to reach your goal.</>}
            </div>

            <div className="contribute-row">
              <input
                type="number"
                placeholder="Add ₹"
                step="0.01"
                value={contributeAmt}
                onChange={(e) => setContributeAmt(e.target.value)}
              />
              <button onClick={contributeToGoal}>Add to savings</button>
              <button className="clear-goal" onClick={removeGoal}>Remove goal</button>
            </div>
          </div>
        )}
      </div>

      <div className="footer-note">Signed in as {user.email} — your data is private to your account.</div>
    </div>
  );
}