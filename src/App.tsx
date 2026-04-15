import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NewModel } from './pages/NewModel';
import { ModelsList } from './pages/ModelsList';
import { Report } from './pages/Report';
import { Admin } from './pages/Admin';
import { Instructions } from './pages/Instructions';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from 'sonner';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="seidr-theme">
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Instructions />} />
            <Route path="models" element={<ModelsList />} />
            <Route path="models/new" element={<NewModel />} />
            <Route path="models/:id" element={<Report />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
      <Toaster position="bottom-right" richColors theme="system" />
    </ThemeProvider>
  );
}

export default App;