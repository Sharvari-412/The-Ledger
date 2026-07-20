# The Ledger — Full Build Manual (Next.js + Supabase + Vercel)

This is a complete, from-scratch walkthrough. Follow it top to bottom. I've already
built and test-compiled this exact project on my end (`npm run build` passes clean),
so if something breaks for you, it's almost always an environment/setup step, not
the code — check the **Troubleshooting** section at the bottom first.

---

## Part 0 — What you need installed

| Tool | Why | Check you have it |
|---|---|---|
| **Node.js** (v18.18+) | Runs Next.js, npm | `node -v` |
| **npm** (comes with Node) | Installs packages | `npm -v` |
| **VS Code** | Editor | already have it |
| **Git** | Push code to GitHub → Vercel deploys from there | `git -v` |
| **A GitHub account** | Vercel deploys straight from a GitHub repo | — |
| **A Supabase account** | Free tier, at [supabase.com](https://supabase.com) | — |
| **A Vercel account** | Free tier, at [vercel.com](https://vercel.com) — sign up with GitHub | — |

You do **not** need to install Supabase or Vercel CLIs for this — everything below
uses the dashboards and one `npm install`.

---

## Part 1 — Create the Supabase project (database + auth)

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Name it (e.g. `the-ledger`), set a database password (save it somewhere), pick a region close to you (e.g. Mumbai/Singapore), click **Create new project**. Takes ~2 minutes to spin up.
3. Once it's ready, go to **SQL Editor** (left sidebar) → **New query**.
4. Paste in the entire contents of `supabase/schema.sql` from the project (included below) and click **Run**.

```sql
-- ========== ENTRIES (expenses & income) ==========
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  created_at timestamptz not null default now()
);

alter table entries enable row level security;

create policy "Users can view their own entries"
  on entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own entries"
  on entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own entries"
  on entries for delete
  using (auth.uid() = user_id);

-- ========== GOALS (savings target) ==========
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric not null check (target > 0),
  saved numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;

create policy "Users can view their own goals"
  on goals for select
  using (auth.uid() = user_id);

create policy "Users can insert their own goals"
  on goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goals"
  on goals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own goals"
  on goals for delete
  using (auth.uid() = user_id);

-- ========== SETTINGS (starting balance) ==========
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_balance numeric not null default 0
);

alter table settings enable row level security;

create policy "Users can view their own settings"
  on settings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on settings for update
  using (auth.uid() = user_id);
```

5. Confirm it worked: go to **Table Editor** — you should see `entries`, `goals`, and `settings` tables, each with a locked padlock icon (means RLS is on).

6. **(Recommended for testing) Turn off email confirmation** so you can sign up and log in immediately without clicking a confirmation email:
   - Go to **Authentication** → **Providers** → **Email**.
   - Turn off **"Confirm email"**.
   - You can turn this back on later before going properly live.

7. Grab your API keys: **Project Settings** (gear icon) → **API**.
   - Copy the **Project URL**
   - Copy the **anon / public** key
   You'll paste both into `.env.local` in Part 3.

---

## Part 2 — Set up the project in VS Code

Open a terminal in VS Code (`` Ctrl+` ``) and run:

```bash
npx create-next-app@latest the-ledger --js --no-tailwind --no-eslint --app --no-src-dir --import-alias "@/*"
cd the-ledger
npm install @supabase/supabase-js
```

This scaffolds a fresh Next.js app and installs the Supabase client. Now open the
`the-ledger` folder in VS Code (`File > Open Folder`).

Delete these default files, you won't need them:
```bash
rm app/page.module.css
```

Create these folders:
```bash
mkdir lib components supabase
```

---

## Part 3 — Environment variables

Create a file called `.env.local` in the project root (same level as `package.json`):

```
NEXT_PUBLIC_SUPABASE_URL=paste-your-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-key-here
```

Use the values you copied in Part 1, step 7. **Never commit this file** — `create-next-app` already adds `.env*.local` to `.gitignore` by default, but double check.

---

## Part 4 — The code

Create each file below exactly as shown.

### `lib/supabaseClient.js`
```js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### `components/AuthForm.js`
```js
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthForm() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({
          type: 'info',
          text: 'Account created. Check your email to confirm, then sign in.',
        });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      }
    }

    setLoading(false);
  }

  return (
    <div className="auth-card">
      <div className="masthead">
        <div className="kicker">Personal Accounts</div>
        <h1>The Ledger</h1>
        <div className="rule"></div>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>

        {message && (
          <div className={`auth-message ${message.type}`}>{message.text}</div>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className="switch-mode"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage(null);
          }}
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
```

### `components/Ledger.js`
```js
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
```

### `app/page.js`
```js
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AuthForm from '@/components/AuthForm';
import Ledger from '@/components/Ledger';

export default function Home() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="loading-state">Loading…</div>;
  }

  return session ? <Ledger session={session} /> : <AuthForm />;
}
```

### `app/layout.js`
```js
import "./globals.css";

export const metadata = {
  title: "The Ledger — Expense & Savings Tracker",
  description: "Track expenses, running balance, and savings goals in INR.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### `app/globals.css`
This one's long (full ledger visual styling) — copy it from the `app/globals.css` file in the zip I've attached, so it doesn't get mangled by copy-paste here. It defines all the classes referenced above (`.balance-card`, `.ledger-row`, `.gauge`, `.auth-form`, etc.) plus the color palette and fonts.

### `supabase/schema.sql`
Already used in Part 1 — keep a copy of it in this folder too, so your repo documents its own database schema.

---

## Part 5 — Run it locally

```bash
npm run dev
```

Open `http://localhost:3000`. You should see the ledger's sign-in screen. Sign up
with a real-looking email + a 6+ character password, sign in, and start adding
entries — they're now actually being written to your Supabase database (check the
**Table Editor** in Supabase to see rows appear live).

---

## Part 6 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: The Ledger"
```

Create a new empty repo on GitHub (no README/gitignore, you already have them), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/the-ledger.git
git branch -M main
git push -u origin main
```

---

## Part 7 — Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import the `the-ledger` repo.
2. Vercel auto-detects Next.js — leave build settings as default.
3. Before deploying, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = (same value as your `.env.local`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (same value)
4. Click **Deploy**. Takes ~1–2 minutes.
5. You'll get a live URL like `the-ledger.vercel.app`. Open it, sign up, and confirm it works in production the same way it did locally.

Every future `git push` to `main` auto-redeploys — that's the whole workflow going forward.

---

## Troubleshooting

**`Module not found: Can't resolve '@/lib/supabaseClient'`**
Your `jsconfig.json` needs the `@/*` path alias. It should contain:
```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
```
`create-next-app` adds this automatically if you used the `--import-alias "@/*"` flag as shown in Part 2.

**Sign up succeeds but sign-in says "Email not confirmed"**
You left "Confirm email" on in Supabase (Part 1, step 6). Either turn it off for testing, or check the inbox of the email you signed up with for the confirmation link.

**Entries don't show up / silently fail to save**
Almost always a Row Level Security issue. Double-check you ran the *entire* `schema.sql`, including the `create policy` statements — if only the `create table` lines ran, RLS blocks all reads/writes by default. Go to Supabase → Authentication → check you're actually signed in as a user (Table Editor → your tables should show rows tagged with your `user_id` after you add something).

**Blank white page, console shows Supabase env var warning**
`.env.local` is missing or has a typo. Restart `npm run dev` after creating/editing it — Next.js only reads env files at server start, not on hot-reload.

**Vercel deploy succeeds but the live site shows the same env var warning**
You forgot to add the environment variables in the Vercel project settings (Part 7, step 3), or added them after the first deploy — in that case go to **Project → Settings → Environment Variables**, add them, then **Deployments → ⋯ → Redeploy**.

**`git push` asks for a password and rejects it**
GitHub no longer accepts account passwords over HTTPS git. Either use a **Personal Access Token** (GitHub → Settings → Developer settings → generate one, use it as the password) or set up SSH keys and use the `git@github.com:...` remote URL instead.

**Fonts don't look right / fall back to a generic serif**
Check your internet connection when the page first loads — the fonts load from Google Fonts CDN via the `<link>` tags in `layout.js`. If you're on a restricted network, they'll silently fall back to the browser default serif/sans, which won't break anything, just look plainer.

**Numbers show as `$` instead of `₹`**
Something got overwritten in `Ledger.js` — check the `inrFormatter` at the top still says `currency: 'INR'`.

---

## What's next (multi-currency, whenever you're ready)

- Add a `currency` column to the `settings` table (default `'INR'`).
- Add a dropdown in the UI to pick a currency code.
- Swap the hardcoded `'INR'` in `inrFormatter` for the user's chosen code — `Intl.NumberFormat` already supports every major currency, so this is a small, contained change.
