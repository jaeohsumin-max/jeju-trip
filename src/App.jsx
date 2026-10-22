import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Profile from './pages/Profile.jsx';
import Agent from './pages/Agent.jsx';
import PhotosPage from './pages/PhotosPage.jsx';
import ToolsTest from './pages/ToolsTest.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/agent" element={<Agent />} />
      <Route path="/photos" element={<PhotosPage />} />
      <Route path="/tools-test" element={<ToolsTest />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
