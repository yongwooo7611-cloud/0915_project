import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminLoginPage from './pages/AdminLoginPage'
import BoardPage from './pages/BoardPage'
import CreatePostPage from './pages/CreatePostPage'
import EditPostPage from './pages/EditPostPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PostDetailPage from './pages/PostDetailPage'
import ProfilePage from './pages/ProfilePage'
import SignupPage from './pages/SignupPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/board/new" element={<CreatePostPage />} />
            <Route path="/board/:postId/edit" element={<EditPostPage />} />
            <Route path="/board/:postId" element={<PostDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
