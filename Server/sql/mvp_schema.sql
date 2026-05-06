-- Doves Holdings - Casket Stock and Claim Fulfillment MVP schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.casket_types (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  unit text not null default 'unit',
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  casket_type_id uuid not null references public.casket_types(id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, casket_type_id)
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  policy_number text not null,
  policy_holder_name text not null,
  branch_id uuid not null references public.branches(id),
  policy_holder_user_id uuid references auth.users(id),
  requested_casket_type_id uuid references public.casket_types(id),
  requested_quantity integer not null default 1 check (requested_quantity > 0),
  status text not null default 'pending' check (status in ('pending', 'pending_manager', 'issued', 'cancelled')),
  clerk_approval_status text not null default 'pending' check (clerk_approval_status in ('pending', 'approved', 'rejected')),
  clerk_approved_by uuid references auth.users(id),
  clerk_approved_at timestamptz,
  clerk_notes text,
  manager_approval_status text not null default 'pending' check (manager_approval_status in ('pending', 'approved', 'rejected')),
  manager_approved_by uuid references auth.users(id),
  manager_approved_at timestamptz,
  manager_notes text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.claims
  add column if not exists policy_holder_user_id uuid references auth.users(id),
  add column if not exists requested_casket_type_id uuid references public.casket_types(id),
  add column if not exists requested_quantity integer not null default 1,
  add column if not exists clerk_approval_status text not null default 'pending',
  add column if not exists clerk_approved_by uuid references auth.users(id),
  add column if not exists clerk_approved_at timestamptz,
  add column if not exists clerk_notes text,
  add column if not exists manager_approval_status text not null default 'pending',
  add column if not exists manager_approved_by uuid references auth.users(id),
  add column if not exists manager_approved_at timestamptz,
  add column if not exists manager_notes text;

-- Align constraints for existing databases that were created before dual-approval workflow.
alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims
  add constraint claims_status_check
  check (status in ('pending', 'pending_manager', 'issued', 'cancelled'));

alter table public.claims drop constraint if exists claims_clerk_approval_status_check;
alter table public.claims
  add constraint claims_clerk_approval_status_check
  check (clerk_approval_status in ('pending', 'approved', 'rejected'));

alter table public.claims drop constraint if exists claims_manager_approval_status_check;
alter table public.claims
  add constraint claims_manager_approval_status_check
  check (manager_approval_status in ('pending', 'approved', 'rejected'));

create table if not exists public.casket_issues (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  casket_type_id uuid not null references public.casket_types(id),
  quantity integer not null check (quantity > 0),
  issued_by uuid references auth.users(id),
  issued_at timestamptz not null default now(),
  notes text
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  casket_type_id uuid not null references public.casket_types(id),
  movement_type text not null check (movement_type in ('IN', 'OUT', 'ADJUSTMENT')),
  quantity integer not null check (quantity > 0),
  reference_claim_id uuid references public.claims(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (
    role in (
      'General Manager',
      'Stores Clerk',
      'Branch Manager',
      'Policy Holder',
      'System Administrator'
    )
  ),
  branch_id uuid references public.branches(id),
  city text,
  physical_address text,
  is_approved boolean not null default false,
  must_reset_password boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists city text,
  add column if not exists physical_address text,
  add column if not exists is_approved boolean not null default false,
  add column if not exists must_reset_password boolean not null default true,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz;

create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  casket_type_id uuid not null references public.casket_types(id),
  quantity integer not null check (quantity > 0),
  delivery_note_url text not null,
  delivery_note_name text not null,
  notes text,
  status text not null default 'pending_manager' check (status in ('pending_manager', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id),
  manager_reviewed_by uuid references auth.users(id),
  manager_reviewed_at timestamptz,
  manager_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts(id) on delete cascade,
  casket_type_id uuid not null references public.casket_types(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

insert into public.branches (code, name)
values
  ('HQ', 'Head Office'),
  ('BYO', 'Bulawayo Branch'),
  ('MUT', 'Mutare Branch')
on conflict (code) do nothing;

insert into public.casket_types (sku, name)
values
  ('CASK-BASIC', 'Basic Casket'),
  ('CASK-STANDARD', 'Standard Casket'),
  ('CASK-PREMIUM', 'Premium Casket')
on conflict (sku) do nothing;

-- Keep balances updated timestamp fresh when modified.
create or replace function public.set_updated_at_inventory_balances()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_balances_updated_at on public.inventory_balances;
create trigger trg_inventory_balances_updated_at
before update on public.inventory_balances
for each row
execute procedure public.set_updated_at_inventory_balances();

-- RLS setup
alter table public.branches enable row level security;
alter table public.casket_types enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.claims enable row level security;
alter table public.casket_issues enable row level security;
alter table public.stock_movements enable row level security;
alter table public.user_profiles enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;

drop policy if exists "branches readable by authenticated users" on public.branches;
create policy "branches readable by authenticated users"
on public.branches for select
to authenticated
using (true);

drop policy if exists "casket types readable by authenticated users" on public.casket_types;
create policy "casket types readable by authenticated users"
on public.casket_types for select
to authenticated
using (true);

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "admins manage profiles" on public.user_profiles;
create policy "admins manage profiles"
on public.user_profiles for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.role in ('System Administrator', 'General Manager')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.role in ('System Administrator', 'General Manager')
  )
);

drop policy if exists "inventory read by role scope" on public.inventory_balances;
create policy "inventory read by role scope"
on public.inventory_balances for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "inventory write by role scope" on public.inventory_balances;
create policy "inventory write by role scope"
on public.inventory_balances for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "claims read by role scope" on public.claims;
create policy "claims read by role scope"
on public.claims for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
        or (p.role = 'Policy Holder' and policy_holder_user_id = auth.uid())
      )
  )
);

drop policy if exists "claims write by role scope" on public.claims;
create policy "claims write by role scope"
on public.claims for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
        or (p.role = 'Policy Holder' and policy_holder_user_id = auth.uid())
      )
  )
);

drop policy if exists "issues read by role scope" on public.casket_issues;
create policy "issues read by role scope"
on public.casket_issues for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "issues write by role scope" on public.casket_issues;
create policy "issues write by role scope"
on public.casket_issues for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "movements read by role scope" on public.stock_movements;
create policy "movements read by role scope"
on public.stock_movements for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "movements write by role scope" on public.stock_movements;
create policy "movements write by role scope"
on public.stock_movements for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "stock receipts read by role scope" on public.stock_receipts;
create policy "stock receipts read by role scope"
on public.stock_receipts for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "stock receipts submit by stores clerk" on public.stock_receipts;
create policy "stock receipts submit by stores clerk"
on public.stock_receipts for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.role = 'Stores Clerk'
      and p.branch_id = branch_id
  )
);

drop policy if exists "stock receipts manager review" on public.stock_receipts;
create policy "stock receipts manager review"
on public.stock_receipts for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role = 'Branch Manager' and p.branch_id = branch_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role = 'Branch Manager' and p.branch_id = branch_id)
      )
  )
);

drop policy if exists "stock receipt items read by role scope" on public.stock_receipt_items;
create policy "stock receipt items read by role scope"
on public.stock_receipt_items for select
to authenticated
using (
  exists (
    select 1
    from public.stock_receipts r
    join public.user_profiles p on p.user_id = auth.uid()
    where r.id = receipt_id
      and (
        p.role in ('System Administrator', 'General Manager')
        or (p.role in ('Branch Manager', 'Stores Clerk') and p.branch_id = r.branch_id)
      )
  )
);

drop policy if exists "stock receipt items insert with receipt scope" on public.stock_receipt_items;
create policy "stock receipt items insert with receipt scope"
on public.stock_receipt_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.stock_receipts r
    join public.user_profiles p on p.user_id = auth.uid()
    where r.id = receipt_id
      and p.role = 'Stores Clerk'
      and p.branch_id = r.branch_id
  )
);

