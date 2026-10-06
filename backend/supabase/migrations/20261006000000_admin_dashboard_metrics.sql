create or replace function public.get_admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      (now() at time zone 'Asia/Seoul')::date as today,
      date_trunc('month', now() at time zone 'Asia/Seoul')::date as month_start
  ),
  totals as (
    select
      (select count(*) from public.users) as users,
      (select count(*) from public.posts) as posts,
      (select count(*) from public.comments) as comments,
      (select count(*) from public.post_views v, bounds b
        where (v.viewed_at at time zone 'Asia/Seoul')::date = b.today) as views,
      (select count(*) from public.users u, bounds b
        where (u.created_at at time zone 'Asia/Seoul')::date < b.month_start) as users_before_month,
      (select count(*) from public.posts p, bounds b
        where (p.created_at at time zone 'Asia/Seoul')::date < b.month_start) as posts_before_month,
      (select count(*) from public.comments c, bounds b
        where (c.created_at at time zone 'Asia/Seoul')::date < b.month_start) as comments_before_month,
      (select count(*) from public.post_views v, bounds b
        where (v.viewed_at at time zone 'Asia/Seoul')::date = b.today - 1) as yesterday_views
  ),
  activity as (
    select day::date as activity_date,
      (select count(*) from (
        select created_at from public.users
        union all select created_at from public.posts
        union all select created_at from public.comments
      ) events where (events.created_at at time zone 'Asia/Seoul')::date = day::date) as value
    from bounds b,
      generate_series(b.today - 6, b.today, interval '1 day') as day
  ),
  categories as (
    select category, count(*) as count
    from public.posts
    group by category
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'users', t.users,
      'posts', t.posts,
      'comments', t.comments,
      'views', t.views
    ),
    'changes', jsonb_build_object(
      'users', case when t.users_before_month = 0 then case when t.users = 0 then 0 else 100 end
        else round((t.users - t.users_before_month) * 100.0 / t.users_before_month, 1) end,
      'posts', case when t.posts_before_month = 0 then case when t.posts = 0 then 0 else 100 end
        else round((t.posts - t.posts_before_month) * 100.0 / t.posts_before_month, 1) end,
      'comments', case when t.comments_before_month = 0 then case when t.comments = 0 then 0 else 100 end
        else round((t.comments - t.comments_before_month) * 100.0 / t.comments_before_month, 1) end,
      'views', case when t.yesterday_views = 0 then case when t.views = 0 then 0 else 100 end
        else round((t.views - t.yesterday_views) * 100.0 / t.yesterday_views, 1) end
    ),
    'weeklyActivity', coalesce((
      select jsonb_agg(jsonb_build_object('date', activity_date, 'value', value) order by activity_date)
      from activity
    ), '[]'::jsonb),
    'categoryDistribution', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', category,
        'count', count,
        'percentage', case when t.posts = 0 then 0 else round(count * 100.0 / t.posts, 1) end
      ) order by count desc, category)
      from categories
    ), '[]'::jsonb)
  )
  from totals t;
$$;

revoke all on function public.get_admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_metrics() to service_role;
