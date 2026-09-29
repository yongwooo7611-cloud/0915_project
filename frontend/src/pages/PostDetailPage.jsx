import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { formatDate } from '../utils'

function PostDetailPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [reactionSubmitting, setReactionSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingContent, setEditingContent] = useState('')

  const loadPost = useCallback(() => {
    api(`/posts/${postId}`).then((data) => {
      setPost(data.post)
      setComments(data.comments)
      setError('')
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [postId])

  useEffect(loadPost, [loadPost])

  useEffect(() => {
    if (!user || loading || String(post?.id) !== postId) return

    let cancelled = false
    api(`/posts/${postId}/view`, { method: 'POST' })
      .then((data) => {
        if (!cancelled) setPost((current) => current ? { ...current, views: data.views } : current)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [postId, post?.id, user, loading])

  const reactToPost = async (reaction) => {
    if (!user) {
      navigate('/login')
      return
    }
    const nextReaction = post.userReaction === reaction ? null : reaction
    setReactionSubmitting(true)
    setError('')
    try {
      const data = await api(`/posts/${postId}/reaction`, {
        method: 'PUT',
        body: JSON.stringify({ reaction: nextReaction }),
      })
      setPost((current) => ({ ...current, userReaction: data.reaction, likes: data.likes, dislikes: data.dislikes }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setReactionSubmitting(false)
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setCommentError('')
    setCommentSubmitting(true)
    try {
      const data = await api(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content: form.get('content') }) })
      setComments((current) => [...current, data.comment])
      setPost((current) => ({ ...current, comments: current.comments + 1 }))
      formElement.reset()
    } catch (requestError) {
      setCommentError(requestError.message)
    } finally {
      setCommentSubmitting(false)
    }
  }

  const updateComment = async (commentId) => {
    setCommentError('')
    try {
      const data = await api(`/posts/${postId}/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editingContent }),
      })
      setComments((current) => current.map((comment) => comment.id === commentId
        ? { ...comment, content: data.content, updatedAt: data.updatedAt }
        : comment))
      setEditingId(null)
      setEditingContent('')
    } catch (requestError) {
      setCommentError(requestError.message)
    }
  }

  const deleteComment = async (comment) => {
    if (!window.confirm('이 댓글을 삭제할까요? 삭제 후에는 복구할 수 없습니다.')) return
    setCommentError('')
    try {
      await api(`/posts/${postId}/comments/${comment.id}`, { method: 'DELETE' })
      setComments((current) => current.filter((item) => item.id !== comment.id))
      setPost((current) => ({ ...current, comments: Math.max(0, current.comments - 1) }))
    } catch (requestError) {
      setCommentError(requestError.message)
    }
  }

  const deletePost = async () => {
    if (!window.confirm(`“${post.title}” 게시글을 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' })
      navigate('/profile')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (loading) return <section className="empty-state container"><p>게시글을 불러오는 중입니다.</p></section>
  if (error && !post) return <section className="empty-state container"><h1>게시글을 찾을 수 없습니다.</h1><p>{error}</p><Link to="/board" className="button">목록으로</Link></section>

  const isOwner = user?.id === post.userId

  return <section className="section container detail-page">
    <div className="detail-toolbar"><Link to="/board" className="back-link">← 게시판으로</Link>{isOwner && <div className="post-manage-actions"><Link to={`/board/${post.id}/edit`} className="button button-small button-secondary">수정</Link><button type="button" className="button button-small button-danger" onClick={deletePost}>삭제</button></div>}</div>
    {error && <p className="form-error">{error}</p>}
    <article className="article-card">
      <header><span className="tag">{post.category}</span><h1>{post.title}</h1><div className="article-author"><span className="mini-avatar">{post.author[0]}</span><div><strong>{post.author}</strong><p>{formatDate(post.createdAt)} · 조회 {post.views}</p></div></div></header>
      <div className="article-content">{post.content.split('\n').map((line, index) => <p key={index}>{line || <br />}</p>)}</div>
      <footer className="article-footer"><div className="reaction-actions"><button type="button" className={post.userReaction === 'like' ? 'active' : ''} disabled={reactionSubmitting} onClick={() => reactToPost('like')} aria-pressed={post.userReaction === 'like'}>좋아요 {post.likes}</button><button type="button" className={post.userReaction === 'dislike' ? 'active dislike' : ''} disabled={reactionSubmitting} onClick={() => reactToPost('dislike')} aria-pressed={post.userReaction === 'dislike'}>싫어요 {post.dislikes}</button></div><span>댓글 {post.comments}</span></footer>
    </article>
    <section className="comments">
      <h2>댓글 <span>{comments.length}</span></h2>
      {authLoading ? <div className="comment-login-prompt">로그인 정보를 확인하는 중입니다.</div> : user ? <form className="comment-form" onSubmit={submitComment}><textarea name="content" aria-label="댓글 내용" placeholder="따뜻한 댓글을 남겨 주세요." rows="3" maxLength="2000" required></textarea><button type="submit" className="button button-small" disabled={commentSubmitting}>{commentSubmitting ? '등록 중...' : '댓글 등록'}</button></form> : <div className="comment-login-prompt"><span>댓글을 작성하려면 로그인이 필요합니다.</span><Link to="/login" className="button button-small">로그인</Link></div>}
      {commentError && <p className="form-error">{commentError}</p>}
      <div>{comments.map((comment) => <div className="comment" key={comment.id}>
        <span className="mini-avatar">{comment.author[0]}</span>
        <div className="comment-body"><div className="comment-heading"><div><strong>{comment.author}</strong><span>{formatDate(comment.createdAt)}{comment.updatedAt !== comment.createdAt ? ' · 수정됨' : ''}</span></div>{user?.id === comment.userId && editingId !== comment.id && <div className="comment-actions"><button type="button" onClick={() => { setEditingId(comment.id); setEditingContent(comment.content) }}>수정</button><button type="button" className="danger" onClick={() => deleteComment(comment)}>삭제</button></div>}</div>
        {editingId === comment.id ? <div className="comment-edit"><textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows="3" maxLength="2000" /><div><button type="button" className="button button-small" disabled={!editingContent.trim()} onClick={() => updateComment(comment.id)}>저장</button><button type="button" className="button button-small button-secondary" onClick={() => setEditingId(null)}>취소</button></div></div> : <p>{comment.content}</p>}</div>
      </div>)}{comments.length === 0 && <p className="comments-empty">아직 댓글이 없습니다. 첫 댓글을 남겨 주세요.</p>}</div>
    </section>
  </section>
}

export default PostDetailPage
