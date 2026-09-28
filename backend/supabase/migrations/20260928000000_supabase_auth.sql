alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

alter table public.users
  alter column password_hash drop not null;
