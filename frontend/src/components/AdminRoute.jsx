import { Navigate } from 'react-router-dom'
import { isTokenExpired } from '../session'

function AdminRoute({ children }) {
  const token = localStorage.getItem('moa_admin_token')
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('moa_admin_token')
    localStorage.removeItem('moa_admin')
    return <Navigate to="/admin/login" replace />
  }
  return children
}

export default AdminRoute
