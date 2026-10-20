begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('post-attachments','post-attachments',false,52428800,
 array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.post_attachments (
 id uuid primary key,
 user_id bigint not null references public.users(id) on delete cascade,
 post_id bigint references public.posts(id) on delete set null,
 storage_path text not null unique,
 original_name text not null check(char_length(original_name) between 1 and 180),
 mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 52428800),
 status text not null default 'pending' check(status in ('pending','ready','deleted')),
 created_at timestamptz not null default now()
);
create index post_attachments_post_idx on public.post_attachments(post_id) where status='ready';
create index post_attachments_user_idx on public.post_attachments(user_id,created_at);
create table public.attachment_deletion_queue (
 storage_path text primary key,
 not_before timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.post_attachments enable row level security;
alter table public.attachment_deletion_queue enable row level security;
revoke all on public.post_attachments,public.attachment_deletion_queue from public,anon,authenticated;
grant all on public.post_attachments,public.attachment_deletion_queue to service_role;

create function public.queue_attachment_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
   insert into public.attachment_deletion_queue(storage_path,not_before) values(old.storage_path,greatest(now(),old.created_at+interval '2 hours')) on conflict do nothing;
   return old;
 elsif new.status='deleted' and old.status<>'deleted' then
   insert into public.attachment_deletion_queue(storage_path,not_before) values(new.storage_path,greatest(now(),new.created_at+interval '2 hours')) on conflict do nothing;
 end if;
 return new;
end; $$;
create trigger queue_deleted_attachment after delete or update on public.post_attachments
 for each row execute function public.queue_attachment_deletion();

create function public.detach_deleted_post_attachments() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.post_attachments set status='deleted',post_id=null where post_id=old.id;
 return old;
end; $$;
create trigger delete_post_attachments before delete on public.posts
 for each row execute function public.detach_deleted_post_attachments();

create function public.reserve_post_attachment(p_user_id bigint,p_id uuid,p_path text,p_name text,p_mime text,p_size bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform id from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if (select count(*) from public.post_attachments where user_id=p_user_id and post_id is null and status<>'deleted' and created_at>now()-interval '24 hours')>=20 then
   raise exception 'PENDING_UPLOAD_LIMIT';
 end if;
 if (select coalesce(sum(byte_size),0) from public.post_attachments where user_id=p_user_id and created_at>now()-interval '24 hours')+p_size>524288000 then
   raise exception 'DAILY_UPLOAD_LIMIT';
 end if;
 insert into public.post_attachments(id,user_id,storage_path,original_name,mime_type,byte_size)
 values(p_id,p_user_id,p_path,p_name,p_mime,p_size);
end; $$;

create function public.save_post_with_attachments(p_user_id bigint,p_post_id bigint,p_category text,p_title text,p_content text,p_attachment_ids uuid[])
returns bigint language plpgsql security definer set search_path='' as $$
declare v_post_id bigint; v_owner bigint;
begin
 perform id from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if cardinality(p_attachment_ids)>10 or cardinality(p_attachment_ids)<>(select count(distinct x) from unnest(p_attachment_ids) x) then
   raise exception 'ATTACHMENT_LIMIT';
 end if;
 if p_post_id is not null then
   select user_id into v_owner from public.posts where id=p_post_id for update;
   if not found then raise exception 'POST_NOT_FOUND'; end if;
   if v_owner<>p_user_id then raise exception 'POST_FORBIDDEN'; end if;
 end if;
 perform id from public.post_attachments where id=any(p_attachment_ids) for update;
 if (select count(*) from public.post_attachments where id=any(p_attachment_ids) and user_id=p_user_id and status='ready' and (post_id is null or post_id=p_post_id))<>cardinality(p_attachment_ids) then
   raise exception 'INVALID_ATTACHMENTS';
 end if;
 if (select coalesce(sum(byte_size),0) from public.post_attachments where id=any(p_attachment_ids))>209715200 then raise exception 'POST_SIZE_LIMIT'; end if;
 if p_post_id is null then
   insert into public.posts(user_id,category,title,content) values(p_user_id,p_category,p_title,p_content) returning id into v_post_id;
 else
   v_post_id:=p_post_id;
   update public.posts set category=p_category,title=p_title,content=p_content where id=v_post_id;
   update public.post_attachments set status='deleted',post_id=null where post_id=v_post_id and not(id=any(p_attachment_ids));
 end if;
 update public.post_attachments set post_id=v_post_id where id=any(p_attachment_ids);
 return v_post_id;
end; $$;

revoke all on function public.queue_attachment_deletion(),public.detach_deleted_post_attachments(),public.reserve_post_attachment(bigint,uuid,text,text,text,bigint),public.save_post_with_attachments(bigint,bigint,text,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.reserve_post_attachment(bigint,uuid,text,text,text,bigint),public.save_post_with_attachments(bigint,bigint,text,text,text,uuid[]) to service_role;
commit;
