-- Application logical backups. Native Supabase PITR remains a separate safety layer.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into storage.buckets(id,name,public,file_size_limit)
values ('service-backups','service-backups',false,52428800)
on conflict(id) do update set public=false;

create table public.service_backup_settings (
 id integer primary key default 1 check(id=1), enabled boolean not null default true,
 interval_hours integer not null default 24 check(interval_hours in(1,6,12,24,168)),
 next_run_at timestamptz not null default ((date_trunc('day',now() at time zone 'Asia/Seoul') + interval '1 day 3 hours') at time zone 'Asia/Seoul'),
 retain_count integer not null default 7 check(retain_count between 1 and 30),
 include_storage boolean not null default true, updated_at timestamptz not null default now()
);
insert into public.service_backup_settings(id) values(1);
create table public.service_backup_jobs (
 id uuid primary key default gen_random_uuid(), status text not null default 'queued'
 check(status in('queued','running','completed','failed','deleting','deleted')),
 trigger text not null check(trigger in('manual','scheduled')), include_storage boolean not null,
 created_at timestamptz not null default now(), completed_at timestamptz, lease_until timestamptz,
 lease_token uuid, prefix text not null, snapshot_done boolean not null default false,
 total_files integer not null default 0, processed_files integer not null default 0,
 error_message text, requested_by bigint references public.admins(id) on delete set null
);
create table public.service_backup_files (
 job_id uuid references public.service_backup_jobs(id) on delete cascade,
 bucket text not null, path text not null, destination text not null,
 byte_size bigint not null default 0, source_updated_at timestamptz,
 status text not null default 'pending' check(status in('pending','copied')),
 primary key(job_id,bucket,path)
);
create table public.service_backup_payloads (
 job_id uuid primary key references public.service_backup_jobs(id) on delete cascade,
 payload jsonb not null
);
do $$ declare t text; begin
 foreach t in array array['service_backup_settings','service_backup_jobs','service_backup_files','service_backup_payloads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 if not exists(select 1 from vault.secrets where name='service_backup_encryption_key') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'service_backup_encryption_key');
 end if;
end $$;

create function public.service_backup_key() returns text language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='service_backup_encryption_key' limit 1;
$$;

create function public.queue_service_backup(p_admin bigint default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare j uuid:=gen_random_uuid(); s public.service_backup_settings;
begin
 select * into s from public.service_backup_settings where id=1 for update;
 if exists(select 1 from public.service_backup_jobs where status in('queued','running')) then
 raise exception 'BACKUP_IN_PROGRESS'; end if;
 insert into public.service_backup_jobs(id,trigger,include_storage,prefix,requested_by)
 values(j,case when p_admin is null then 'scheduled' else 'manual' end,s.include_storage,
 to_char(now() at time zone 'Asia/Seoul','YYYY/MM/DD')||'/'||j::text,p_admin);
 return j;
end $$;

create function public.claim_service_backup(p_token uuid) returns setof public.service_backup_jobs
language plpgsql security definer set search_path='' as $$
declare s public.service_backup_settings; j uuid;
begin
 select * into s from public.service_backup_settings where id=1 for update;
 if s.enabled and s.next_run_at<=now() and not exists(select 1 from public.service_backup_jobs where status in('queued','running')) then
 perform public.queue_service_backup(null);
 update public.service_backup_settings set next_run_at=now()+make_interval(hours=>s.interval_hours) where id=1;
 end if;
 select id into j from public.service_backup_jobs where status in('queued','running')
 and (lease_until is null or lease_until<now()) order by created_at limit 1 for update skip locked;
 if j is null then return; end if;
 return query update public.service_backup_jobs set status='running',lease_token=p_token,lease_until=now()+interval '90 seconds'
 where id=j returning *;
end $$;

create function public.prepare_service_backup(p_job uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.service_backup_jobs; t record; data jsonb:='{}'; rows jsonb;
begin
 select * into j from public.service_backup_jobs where id=p_job and lease_token=p_token and status='running' for update;
 if not found then raise exception 'BACKUP_LEASE_LOST'; end if;
 select payload into rows from public.service_backup_payloads where job_id=p_job;
 if found then return rows; end if;
 for t in select tablename from pg_catalog.pg_tables where schemaname='public' and tablename not like 'service_backup_%' loop
 execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r',t.tablename) into rows;
 data:=data||jsonb_build_object(t.tablename,rows);
 end loop;
 data:=jsonb_build_object('format','bodramdbo-logical-v1','captured_at',now(),'public',data,
 'auth',jsonb_build_object('users',(select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from auth.users u),
 'identities',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from auth.identities i)),
 'buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) from storage.buckets b where id<>'service-backups'),
 'backup_settings',to_jsonb((select s from public.service_backup_settings s where id=1)));
 if j.include_storage then
 insert into public.service_backup_files(job_id,bucket,path,destination,byte_size,source_updated_at)
 select p_job,bucket_id,name,j.prefix||'/storage/'||bucket_id||'/'||name,coalesce((metadata->>'size')::bigint,0),updated_at
 from storage.objects where bucket_id<>'service-backups';
 end if;
 update public.service_backup_jobs set total_files=(select count(*) from public.service_backup_files where job_id=p_job) where id=p_job;
 insert into public.service_backup_payloads values(p_job,data);
 return data;
end $$;

create function public.configure_service_backup_worker(p_url text,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid; n text; v text; begin
 if p_url !~ '^https://[a-z]+\.supabase\.co/functions/v1/api/internal/backups/tick$' then raise exception 'INVALID_WORKER_URL'; end if;
 for n,v in select * from (values('service_backup_worker_url',p_url),('service_backup_worker_token',p_token)) x(n,v) loop
 select id into sid from vault.secrets where name=n;
 if sid is null then perform vault.create_secret(v,n); else perform vault.update_secret(sid,v,n); end if;
 end loop;
 if exists(select 1 from cron.job where jobname='service-backup-worker') then perform cron.unschedule('service-backup-worker'); end if;
 perform cron.schedule('service-backup-worker','* * * * *',$command$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='service_backup_worker_url'),
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_backup_worker_token')),
 body:='{}'::jsonb,timeout_milliseconds:=50000);
 $command$);
end $$;

revoke all on function public.service_backup_key() from public,anon,authenticated;
revoke all on function public.queue_service_backup(bigint) from public,anon,authenticated;
revoke all on function public.claim_service_backup(uuid) from public,anon,authenticated;
revoke all on function public.prepare_service_backup(uuid,uuid) from public,anon,authenticated;
revoke all on function public.configure_service_backup_worker(text,text) from public,anon,authenticated;
grant execute on function public.service_backup_key(),public.queue_service_backup(bigint),public.claim_service_backup(uuid),public.prepare_service_backup(uuid,uuid),public.configure_service_backup_worker(text,text) to service_role;
