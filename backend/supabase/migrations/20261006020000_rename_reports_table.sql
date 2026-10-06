alter table public.reports rename to "신고하기";

comment on table public."신고하기" is '사용자가 게시글 또는 댓글을 신고한 내역과 관리자 처리 상태';
comment on column public."신고하기".reporter_id is '신고한 사용자 ID';
comment on column public."신고하기".target_type is '신고 대상 유형: post 또는 comment';
comment on column public."신고하기".reason is '신고 사유';
comment on column public."신고하기".details is '사용자가 작성한 상세 신고 내용';
comment on column public."신고하기".status is '처리 상태: pending, reviewing, resolved, dismissed';
comment on column public."신고하기".admin_note is '관리자 처리 메모';
