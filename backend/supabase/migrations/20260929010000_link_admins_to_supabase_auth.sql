alter table public.admins
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists idx_admins_auth_user_id on public.admins(auth_user_id);
