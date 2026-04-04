import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { NewModel } from './pages/NewModel';
import { ModelsList } from './pages/ModelsList';
import { Report } from './pages/Report';
import { Admin } from './pages/Admin';
import { ThemeProvider } from './components/theme-provider';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="seidr-theme">
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="models" element={<ModelsList />} />
            <Route path="models/new" element={<NewModel />} />
            <Route path="models/:id" element={<Report />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
