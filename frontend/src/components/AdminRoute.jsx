import { Navigate } from 'react-router-dom'

function AdminRoute({ children }) {
  const token = localStorage.getItem('moa_admin_token')
  return token ? children : <Navigate to="/admin/login" replace />
}

export default AdminRoute
