alter table public.service_backup_files add column source_version text;
create function public.capture_backup_source_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select version into new.source_version from storage.objects where bucket_id=new.bucket and name=new.path;
 return new;
end $$;
revoke all on function public.capture_backup_source_version() from public,anon,authenticated;
create trigger capture_backup_source_version before insert on public.service_backup_files
for each row execute function public.capture_backup_source_version();
