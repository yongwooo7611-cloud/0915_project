process.env.USER_JWT_SECRET ||= 'post-interaction-user-test-secret';
process.env.ADMIN_JWT_SECRET ||= 'post-interaction-admin-test-secret';

const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/database');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  db.exec('BEGIN');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const request = async (path, { token, ...options } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    const first = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: '테스트1', nickname: `tester1-${stamp}`, email: `tester1-${stamp}@example.com`, password: 'password123' }),
    });
    const second = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: '테스트2', nickname: `tester2-${stamp}`, email: `tester2-${stamp}@example.com`, password: 'password123' }),
    });
    assert(first.status === 201 && second.status === 201, '테스트 사용자 생성 실패');

    const createdPost = await request('/posts', {
      method: 'POST', token: first.data.token,
      body: JSON.stringify({ category: '자유', title: '상호작용 테스트', content: '본문' }),
    });
    assert(createdPost.status === 201, '게시글 생성 실패');
    const postId = createdPost.data.id;

    const anonymousView = await request(`/posts/${postId}/view`, { method: 'POST' });
    const view = await request(`/posts/${postId}/view`, { method: 'POST', token: first.data.token });
    const repeatedView = await request(`/posts/${postId}/view`, { method: 'POST', token: first.data.token });
    assert(anonymousView.status === 401, '비로그인 조회가 차단되지 않음');
    assert(view.status === 200 && view.data.views === 1 && repeatedView.data.views === 1, '사용자별 조회수 중복 방지 실패');

    const like = await request(`/posts/${postId}/reaction`, { method: 'PUT', token: first.data.token, body: JSON.stringify({ reaction: 'like' }) });
    const dislike = await request(`/posts/${postId}/reaction`, { method: 'PUT', token: first.data.token, body: JSON.stringify({ reaction: 'dislike' }) });
    assert(like.data.likes === 1 && dislike.data.likes === 0 && dislike.data.dislikes === 1, '반응 전환 실패');

    const createdComment = await request(`/posts/${postId}/comments`, { method: 'POST', token: first.data.token, body: JSON.stringify({ content: '댓글' }) });
    assert(createdComment.status === 201, '댓글 생성 실패');
    const commentId = createdComment.data.comment.id;
    const forbidden = await request(`/posts/${postId}/comments/${commentId}`, { method: 'PUT', token: second.data.token, body: JSON.stringify({ content: '타인 수정' }) });
    assert(forbidden.status === 403, '타인의 댓글 수정이 차단되지 않음');
    const updated = await request(`/posts/${postId}/comments/${commentId}`, { method: 'PUT', token: first.data.token, body: JSON.stringify({ content: '수정 댓글' }) });
    assert(updated.status === 200 && updated.data.content === '수정 댓글', '작성자 댓글 수정 실패');

    const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.ADMIN_JWT_SECRET);
    const hidden = await request(`/admin/comments/${commentId}/visibility`, { method: 'PATCH', token: adminToken, body: JSON.stringify({ hidden: true }) });
    const detail = await request(`/posts/${postId}`);
    assert(hidden.status === 200 && detail.data.comments.length === 0, '관리자 댓글 숨김 실패');
    const deleted = await request(`/admin/comments/${commentId}`, { method: 'DELETE', token: adminToken });
    assert(deleted.status === 200, '관리자 댓글 삭제 실패');

    console.log('Post interaction API checks passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.exec('ROLLBACK');
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
