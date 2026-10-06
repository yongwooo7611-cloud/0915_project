import { useEffect } from 'react'

function Modal({ title, children, onClose, size = 'medium' }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-card modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span className="eyebrow">MOA COMMUNITY</span><h2 id="modal-title">{title}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="닫기">×</button></header><div className="modal-content">{children}</div></section></div>
}

export default Modal
