import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ReportForm from './pages/ReportForm';
import ReportHistory from './pages/ReportHistory';

function App() {
  return (
    <Routes>
      <Route path="/" element={<ReportHistory />} />
      <Route path="/report" element={<ReportForm />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
