
# RJ · AI/LLM Trial MCQ (Login, no OTP) — GitHub Pages + Supabase

**Important:** You must use the **PUBLIC anon key** in `app.js`. **Do NOT** paste the JWT secret or service_role key into the client. If you exposed the JWT secret, rotate it in Supabase Settings → API.

## 1) Supabase setup
1. Project Settings → API → copy **Project URL** (already set) and **anon public key**.

2. Auth → Settings → **Disable email confirmations** (so password sign‑up works without OTP).

3. Auth → Providers → Ensure **Email/Password** is enabled.

4. SQL Editor → run the schema & policies below.

### SQL — Tables & RLS
```sql
create table if not exists profiles (
  id uuid primary key,
  email text,
  name text,
  created_at timestamptz default now()
);

create table if not exists access_codes (
  name text primary key,
  code text not null,
  is_active boolean default true
);

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quiz text not null,
  started_at timestamptz,
  finished_at timestamptz,
  score int,
  unique(user_id, quiz)
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  question_id text not null,
  value jsonb,
  unique(response_id, question_id)
);

alter table profiles enable row level security;
alter table responses enable row level security;
alter table answers enable row level security;
alter table access_codes enable row level security;

create policy "profiles self select" on profiles for select using (auth.uid() = id);
create policy "profiles self insert" on profiles for insert with check (auth.uid() = id);

create policy "responses self select" on responses for select using (auth.uid() = user_id);
create policy "responses self insert" on responses for insert with check (auth.uid() = user_id);
create policy "responses self update" on responses for update using (auth.uid() = user_id);

create policy "answers via own response" on answers
  for all using (
    exists (select 1 from responses r where r.id = response_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from responses r where r.id = response_id and r.user_id = auth.uid())
  );

create policy "access code readable" on access_codes for select using (true);
```

### Seed access code
```sql
insert into access_codes (name, code, is_active) values ('default', 'RJ-2025-L1', true)
on conflict (name) do update set code = excluded.code, is_active = excluded.is_active;
```

## 2) Configure client
Edit `app.js`:

```js
const SUPABASE_URL = 'https://dblrnumdkptatkltvtta.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY' // from Settings → API → Project API keys
```

**Never** use JWT secret or service_role in the browser.

## 3) Deploy to GitHub Pages
- Put these files at the root of `rid2hi.github.io`.

- Commit & push. Open `https://rid2hi.github.io/`.

- Login with email+password, enter `RJ-2025-L1`, start the test.

## Exports
- Supabase Studio → Export CSV from `responses` and `answers`. Join on `id = response_id`.
